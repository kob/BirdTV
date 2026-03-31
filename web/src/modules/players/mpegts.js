/**
 * players/mpegts.js - mpegts.js 播放器
 */

import { state } from '../state.js';
import { shouldUseProxy, getProxyUrl, isLanUdpxyHttpTsUrl } from '../proxy.js';
import { getEffectiveUserAgent } from '../ua.js';

export async function initMpegtsPlayer(url = '', source = null, elements = {}) {
    if (!window.mpegts) { console.error('mpegts.js not loaded'); return null; }

        // 自动将token写入cookie，便于mpegts.js代理请求后端时带上token
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                document.cookie = `authToken=${token}; path=/; SameSite=Strict`;
            }
        } catch (e) { /* ignore */ }
    const videoEl = document.getElementById("video");
    if (state.mpegtsPlayer) { try { state.mpegtsPlayer.destroy(); } catch (e) { /* ignore */ } state.mpegtsPlayer = null; }

    const _artCon = document.getElementById('artplayer-container');
    if (_artCon) _artCon.style.display = 'none';
    if (videoEl) { videoEl.style.display = ''; videoEl.src = ''; videoEl.load(); }

    const useProxy = shouldUseProxy(url, true, source);
    const finalUrl = useProxy ? getProxyUrl(url, getEffectiveUserAgent()) : url;

    state.mpegtsPlayer = mpegts.createPlayer({
        type: 'mpegts',
        url: finalUrl,
        isLive: true,
        hasAudio: true,
        hasVideo: true
    });
    state.mpegtsPlayer.attachMediaElement(videoEl);
    state.mpegtsPlayer.load();
    state.mpegtsPlayer.play();

    return state.mpegtsPlayer;
}
