/**
 * players/artplayer.js - ArtPlayer + HLS.js 播放器
 */

import { state } from '../state.js';
import {
    shouldUseProxy, getProxyUrl, unwrapProxySourceUrl, toSameOriginM3UProxyUrl,
    toTvIillSameOriginUrl, isCorsRestricted, getTempProxyMode
} from '../proxy.js';
import { getEffectiveUserAgent } from '../ua.js';

export function isUnsupportedHevcTsError(data) {
    const details = String(data?.details || '');
    const message = String(data?.error?.message || '');
    return details === 'fragParsingError' && /Unsupported HEVC in M2TS found/i.test(message);
}

export function isUnrecoverableHlsCodecError(data) {
    const details = String(data?.details || '');
    const message = String(data?.error?.message || '');
    const reason = String(data?.reason || '');
    const knownFatal = details === 'bufferAddCodecError' || details === 'bufferIncompatibleCodecsError';
    const addSourceBuffer = /addSourceBuffer/i.test(message) && /NotSupportedError/i.test(`${message} ${reason}`);
    return knownFatal || addSourceBuffer;
}

export function canUseNativeHlsPlayback() {
    const video = document.getElementById("video");
    return video && typeof video.canPlayType === 'function' && Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
}

export async function initArtPlayer(url = '', source = null, elements = {}) {
    if (!window.Artplayer) { console.error('ArtPlayer not loaded'); return null; }

    if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
    if (state.hlsPlayer) { state.hlsPlayer.destroy(); state.hlsPlayer = null; }

    const container = document.getElementById('artplayer-container');
    if (!container) { console.error('artplayer-container not found'); return null; }

    const videoEl = document.getElementById("video");
    if (videoEl) videoEl.style.display = 'none';
    container.style.display = 'block';
    container.innerHTML = '';

    const effectiveUserAgent = getEffectiveUserAgent();
    const unwrappedSourceUrl = unwrapProxySourceUrl(url);
    const manualLineLocked = !!(source?.manualLineLocked);
    const genericProxyUrl = /^https?:/i.test(String(unwrappedSourceUrl || '')) ? toSameOriginM3UProxyUrl(unwrappedSourceUrl, effectiveUserAgent) : null;
    const tvIillSameOriginUrl = toTvIillSameOriginUrl(unwrappedSourceUrl, effectiveUserAgent);
    const corsRestricted = isCorsRestricted(unwrappedSourceUrl);
    const useProxy = shouldUseProxy(unwrappedSourceUrl, false, source);

    // 自动将token写入cookie，便于HLS.js/TS流代理请求后端时带上token
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            const isHttps = window.location.protocol === 'https:';
                const secureFlag = isHttps ? '; Secure' : '';
                document.cookie = `authToken=${token}; path=/; SameSite=Strict${secureFlag}`;
        }
    } catch (e) { /* ignore */ }

    state.artPlayer = new Artplayer({
        container,
        url,
        type: 'hls',
        volume: 1.0,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: true,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: false,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        airplay: true,
        theme: '#2d8cff',
        lang: navigator.language.toLowerCase() || 'zh-cn',
        moreVideoAttr: { crossOrigin: 'anonymous', playsInline: true, webkitPlaysInline: true },
        customType: {
            hls: function(video, url, art) {
                let finalUrl = url;
                if (useProxy) {
                    finalUrl = tvIillSameOriginUrl || genericProxyUrl || url;
                }

                if (Hls && Hls.isSupported()) {
                    const hls = new Hls({
                        enableWorker: true, lowLatencyMode: true,
                        backBufferLength: 90, maxBufferLength: 30, maxMaxBufferLength: 60,
                        maxBufferSize: 60 * 1000 * 1000, maxBufferHole: 0.5,
                        liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
                        manifestLoadingTimeOut: 30000, manifestLoadingMaxRetry: 2,
                        fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 6,
                        xhrSetup: (xhr) => { xhr.withCredentials = true; }
                    });
                    hls.loadSource(finalUrl);
                    hls.attachMedia(video);
                    art.hls = hls;

                    hls.on(Hls.Events.ERROR, function(event, data) {
                        if (data.fatal) {
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                                case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                                default: hls.destroy(); break;
                            }
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = finalUrl;
                }
            }
        },
        moreVideoAttr: { crossOrigin: 'anonymous', playsInline: true, webkitPlaysInline: true }
    });

    state.artPlayer.on('play', () => { if (elements.statusText) { elements.statusText.textContent = '正在播放'; } });
    state.artPlayer.on('error', (err) => { console.error('ArtPlayer错误:', err); });
    return state.artPlayer;
}
