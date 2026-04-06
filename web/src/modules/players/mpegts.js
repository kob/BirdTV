/**
 * players/mpegts.js - mpegts.js 播放器
 */

import { state } from '../state.js';
import { shouldUseProxy, getProxyUrl, isLanUdpxyHttpTsUrl } from '../proxy.js';
import { getEffectiveUserAgent } from '../ua.js';

export async function initMpegtsPlayer(url = '', source = null, elements = {}) {
    if (!window.mpegts) { console.error('mpegts.js not loaded'); return null; }

    const startTime = performance.now();
    
    // 自动将 token 写入 cookie
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            document.cookie = `authToken=${token}; path=/; SameSite=Strict`;
        }
    } catch (e) { /* ignore */ }
    
    const videoEl = document.getElementById("video");
    
    // 快速清理旧播放器
    if (state.mpegtsPlayer) {
        try { 
            state.mpegtsPlayer.pause();
            state.mpegtsPlayer.unload();
            state.mpegtsPlayer.detachMediaElement();
            state.mpegtsPlayer.destroy(); 
        } catch (e) { /* ignore */ }
        state.mpegtsPlayer = null;
    }

    // 复用 video 元素
    if (videoEl) { 
        videoEl.style.display = ''; 
        // 不清空 src，让 mpegts.js 直接 attach
    }

    const useProxy = shouldUseProxy(url, true, source);
    const finalUrl = useProxy ? getProxyUrl(url, getEffectiveUserAgent()) : url;
    
    // 优化配置：针对直播优化
    const mpegtsConfig = {
        type: 'mpegts',
        url: finalUrl,
        isLive: true,
        hasAudio: true,
        hasVideo: true,
        // 优化参数
        enableWorker: true, // 使用 Web Worker
        liveSync: true, // 启用直播同步
        stashInitialSize: 128, // 减少初始缓冲区（默认 128KB）
        lazyLoad: false, // 直播不需要懒加载
        lazyLoadMaxBuffer: 0,
        speed: 1.0
    };

    state.mpegtsPlayer = mpegts.createPlayer(mpegtsConfig);
    state.mpegtsPlayer.attachMediaElement(videoEl);
    
    // 优化：先 load 再 play，减少等待
    try {
        await state.mpegtsPlayer.load();
        await state.mpegtsPlayer.play();
        
        const loadTime = performance.now() - startTime;
        console.log(`[MpegtsPlayer] 播放启动，耗时：${loadTime.toFixed(0)}ms`);
    } catch (e) {
        console.error('[MpegtsPlayer] 启动失败:', e);
        throw e;
    }

    return state.mpegtsPlayer;
}