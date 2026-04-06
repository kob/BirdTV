/**
 * players/native.js - 原生 HTML5 Video 播放器
 */

import { state } from '../state.js';

export async function initNativeVideoPlayer(url = '', source = null, elements = {}, options = {}) {
        // 自动将token写入cookie，便于native video代理请求后端时带上token
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                const isHttps = window.location.protocol === 'https:';
            const secureFlag = isHttps ? '; Secure' : '';
            document.cookie = `authToken=${token}; path=/; SameSite=Strict${secureFlag}`;
            }
        } catch (e) { /* ignore */ }
    let hasHandledFatalError = false;
    const triggerNativeFatal = (message, code = 4011) => {
        if (hasHandledFatalError || typeof options.onFatalError !== 'function') return;
        hasHandledFatalError = true;
        const error = new Error(message || '原生播放器失败');
        error.code = code;
        error.source = source;
        options.onFatalError(error);
    };

    if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
    if (state.hlsPlayer) { state.hlsPlayer.destroy(); state.hlsPlayer = null; }

    const videoEl = document.getElementById("video");

    videoEl.src = '';
    videoEl.load();
    videoEl.style.display = '';

    videoEl.preload = 'auto';
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.muted = false;
    videoEl.volume = 1.0;
    videoEl.autoplay = true;

    let nativeFinalUrl = url;
    if (state.redirectCache.has(url)) {
        const cached = state.redirectCache.get(url);
        if (cached.redirected && cached.finalUrl) nativeFinalUrl = cached.finalUrl;
    }

    try { videoEl.src = nativeFinalUrl; } catch (error) { videoEl.src = url; }

    videoEl.onloadedmetadata = () => {
        console.log('原生视频：元数据已加载', videoEl.videoWidth + 'x' + videoEl.videoHeight);
    };

    videoEl.onloadeddata = () => {
        const playPromise = videoEl.play();
        if (playPromise) playPromise.then(() => {}).catch(error => {
            console.warn('自动播放被阻止:', error);
        });
    };

    videoEl.onplaying = () => { if (elements.statusText) elements.statusText.textContent = '正在播放'; };

    videoEl.onerror = () => {
        if (videoEl.error) {
            const code = videoEl.error.code;
            switch(code) {
                case MediaError.MEDIA_ERR_NETWORK: break;
                case MediaError.MEDIA_ERR_DECODE: break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: break;
            }
        }
        triggerNativeFatal('原生视频播放失败', 4011);
    };

    let noVideoCheckCount = 0;
    const noVideoCheckInterval = setInterval(() => {
        if (videoEl.readyState >= 2 && videoEl.videoWidth === 0 && videoEl.videoHeight === 0) {
            noVideoCheckCount++;
            if (noVideoCheckCount >= 3) {
                triggerNativeFatal('原生播放有声音无图像', 4010);
                clearInterval(noVideoCheckInterval);
            }
        } else { clearInterval(noVideoCheckInterval); }
        if (noVideoCheckCount >= 10) clearInterval(noVideoCheckInterval);
    }, 1000);

    return videoEl;
}
