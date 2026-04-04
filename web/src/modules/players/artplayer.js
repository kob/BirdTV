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

    const startTime = performance.now();
    const container = document.getElementById('artplayer-container');
    if (!container) { console.error('artplayer-container not found'); return null; }

    const videoEl = document.getElementById("video");
    
    // 快速清理旧播放器
    if (state.artPlayer) {
        try { state.artPlayer.destroy(true); } catch (e) { /* ignore */ }
        state.artPlayer = null;
    }
    if (state.hlsPlayer) {
        try { state.hlsPlayer.destroy(); } catch (e) { /* ignore */ }
        state.hlsPlayer = null;
    }

    // 复用容器，不清空 innerHTML，避免重复创建 DOM
    if (videoEl) videoEl.style.display = 'none';
    container.style.display = 'block';
    if (!container.querySelector('video')) {
        container.innerHTML = '';
    }

    const effectiveUserAgent = getEffectiveUserAgent();
    const unwrappedSourceUrl = unwrapProxySourceUrl(url);
    const manualLineLocked = !!(source?.manualLineLocked);
    const genericProxyUrl = /^https?:/i.test(String(unwrappedSourceUrl || '')) ? toSameOriginM3UProxyUrl(unwrappedSourceUrl, effectiveUserAgent) : null;
    const tvIillSameOriginUrl = toTvIillSameOriginUrl(unwrappedSourceUrl, effectiveUserAgent);
    const corsRestricted = isCorsRestricted(unwrappedSourceUrl);
    const useProxy = shouldUseProxy(unwrappedSourceUrl, false, source);
    
    // 直连模式优化：跳过不必要的 proxy URL 生成
    const isDirectMode = !useProxy;

    // 自动将 token 写入 cookie
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            const isHttps = window.location.protocol === 'https:';
            const secureFlag = isHttps ? '; Secure' : '';
            document.cookie = `authToken=${token}; path=/; SameSite=Strict${secureFlag}`;
        }
    } catch (e) { /* ignore */ }

    // 优化 HLS.js 配置：针对直播场景优化首屏速度
    const hlsConfig = {
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60, // 减少内存占用
        maxBufferLength: 15, // 减少首屏等待时间（从 30 降到 15）
        maxMaxBufferLength: 30, // 减少最大缓冲区
        maxBufferSize: 30 * 1000 * 1000, // 30MB 足够
        maxBufferHole: 0.3, // 更严格的 buffer hole 检测
        startFnsPrefetch: true, // 预加载片段
        liveSyncDurationCount: 2, // 减少直播同步延迟（从 3 降到 2）
        liveMaxLatencyDurationCount: 6, // 减少最大延迟（从 10 降到 6）
        manifestLoadingTimeOut: 15000, // 减少超时时间（从 30s 降到 15s）
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 500, // 减少重试延迟
        fragLoadingTimeOut: 15000, // 减少片段加载超时（从 20s 降到 15s）
        fragLoadingMaxRetry: 4, // 减少重试次数（从 6 降到 4）
        fragLoadingRetryDelay: 500,
        xhrSetup: (xhr) => { xhr.withCredentials = true; }
    };

    // 直连模式进一步优化
    if (isDirectMode) {
        hlsConfig.maxBufferLength = 10; // 直连模式缓冲区更小，更快出画面
        hlsConfig.liveSyncDurationCount = 1; // 直连延迟更低
    }

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
                    // 复用 HLS.js 实例（如果已存在且配置相同）
                    if (state.hlsPlayer && state.hlsPlayer.currentUrl === finalUrl) {
                        state.hlsPlayer.startLoad();
                        art.hls = state.hlsPlayer;
                        console.log('[ArtPlayer] 复用 HLS.js 实例');
                    } else {
                        // 销毁旧实例
                        if (state.hlsPlayer) {
                            try { state.hlsPlayer.destroy(); } catch (e) { /* ignore */ }
                        }
                        
                        const hls = new Hls(hlsConfig);
                        state.hlsPlayer = hls;
                        state.hlsPlayer.currentUrl = finalUrl;
                        
                        hls.loadSource(finalUrl);
                        hls.attachMedia(video);
                        art.hls = hls;

                        // 优化错误恢复策略
                        let networkRetryCount = 0;
                        const MAX_NETWORK_RETRY = 3;
                        
                        hls.on(Hls.Events.ERROR, function(event, data) {
                            if (data.fatal) {
                                switch(data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        networkRetryCount++;
                                        if (networkRetryCount <= MAX_NETWORK_RETRY) {
                                            console.log(`[HLS] 网络错误，重试 ${networkRetryCount}/${MAX_NETWORK_RETRY}`);
                                            hls.startLoad();
                                        } else {
                                            console.error('[HLS] 网络错误，放弃重试');
                                            hls.destroy();
                                        }
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        hls.recoverMediaError();
                                        break;
                                    default:
                                        hls.destroy();
                                        break;
                                }
                            }
                        });
                        
                        // 监听 FRAG_LOADED 以优化首屏
                        hls.on(Hls.Events.FRAG_LOADED, function() {
                            const loadTime = performance.now() - startTime;
                            console.log(`[ArtPlayer] 首个片段加载完成，耗时：${loadTime.toFixed(0)}ms`);
                        });
                    }
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = finalUrl;
                }
            }
        },
        moreVideoAttr: { crossOrigin: 'anonymous', playsInline: true, webkitPlaysInline: true }
    });

    state.artPlayer.on('play', () => { 
        const loadTime = performance.now() - startTime;
        console.log(`[ArtPlayer] 播放启动，总耗时：${loadTime.toFixed(0)}ms`);
        if (elements.statusText) { elements.statusText.textContent = '正在播放'; } 
    });
    
    state.artPlayer.on('error', (err) => { 
        const loadTime = performance.now() - startTime;
        console.error(`[ArtPlayer] 错误 (耗时：${loadTime.toFixed(0)}ms):`, err); 
    });
    
    return state.artPlayer;
}