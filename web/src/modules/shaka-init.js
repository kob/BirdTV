/**
 * shaka-init.js - Shaka Player 初始化
 */

import { state } from './state.js';
import { SHAKA_RETRY } from './constants.js';
import { getHeaderCaseInsensitive } from './utils.js';
import { formatPlaybackError } from './errors.js';
import { pushDiagnosticEvent } from './diagnostics.js';
import { toSameOriginM3UProxyUrl } from './proxy.js';

export async function initShakaPlayer(elements) {
    const startTime = performance.now();
    
    if (!window.shaka) { if (elements.statusText) elements.statusText.textContent = '播放器库加载失败'; return; }

    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) { if (elements.statusText) elements.statusText.textContent = '浏览器不支持 Shaka'; return; }

    // 快速清理旧实例
    if (state.player) {
        try { 
            if (state.overlay) { state.overlay.destroy(); state.overlay = null; }
            await state.player.unload();
            await state.player.detach();
            state.player.destroy();
        } catch (e) { /* ignore */ }
        state.player = null;
    }

    state.player = new shaka.Player();
    await state.player.attach(elements.video);
    state.overlay = new shaka.ui.Overlay(state.player, elements.video.parentElement, elements.video);

    // 优化配置：针对直播场景优化首屏速度
    state.player.configure({
        manifest: { 
            retryParameters: SHAKA_RETRY, 
            defaultPresentationDelay: 0,
            availabilityWindowOverride: 30, // 限制可用窗口，减少加载时间
            disableAudio: false,
            disableVideo: false
        },
        drm: { retryParameters: SHAKA_RETRY },
        streaming: { 
            retryParameters: SHAKA_RETRY, 
            stallEnabled: true, 
            stallThreshold: 2, // 减少卡顿检测阈值（3→2）
            stallSkip: 0.1, 
            safeSeekOffset: 3, // 减少安全搜索偏移（5→3）
            rebufferingGoal: 5, // 减少重缓冲目标（8→5）
            bufferingGoal: 5, // 减少缓冲目标（8→5）
            bufferBehind: 20, // 减少后方缓冲区（30→20）
            ignoreTextStreamFailures: true,
            // 直播优化
            liveSyncDuration: 3, // 直播同步延迟（默认 30，减少到 3）
            liveSyncInterval: 0.5, // 直播同步检查间隔（默认 1，减少到 0.5）
            // 减少初始加载延迟
            minBytesReceived: 0,
            minBytesToShift: 0
        },
        abr: { 
            enabled: true,
            defaultBandwidthEstimate: 5000000, // 默认带宽估计 5Mbps
            switchInterval: 2, // 减少切换间隔（默认 5，减少到 2）
            bandwidthDowngradeTarget: 0.95, // 带宽降级目标
            bandwidthUpgradeTarget: 0.85 // 带宽升级目标
        }
    });

    const networkingEngine = state.player.getNetworkingEngine();
    if (networkingEngine) {
        networkingEngine.registerRequestFilter((type, request) => {
            // 自动为所有 /m3u-proxy 相关请求加 Authorization 头
            const token = localStorage.getItem('authToken');
            if (Array.isArray(request?.uris) && request.uris.length > 0) {
                request.uris = request.uris.map(uri => rewriteShakaProxyRelativeUri(uri));
                // 只要是代理请求就加 token
                if (request.uris.some(uri => String(uri).includes('/m3u-proxy?url=')) && token) {
                    request.headers = request.headers || {};
                    request.headers['Authorization'] = `Bearer ${token}`;
                }
            }
            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
                request.headers = request.headers || {};
                for (const [k, v] of Object.entries(state.shakaLicenseHeaders || {})) request.headers[k] = v;
                // LICENSE 请求也加 token
                if (token) request.headers['Authorization'] = `Bearer ${token}`;
                return;
            }
        });

        networkingEngine.registerResponseFilter((type, response) => {
            try {
                if (type !== shaka.net.NetworkingEngine.RequestType.MANIFEST) return;
                if (!String(response?.uri || '').toLowerCase().includes('/m3u-proxy?url=')) return;
                const responseUriBeforeRewrite = String(response?.uri || '');
                const finalUrlHeader = getHeaderCaseInsensitive(response.headers, 'X-Final-Url');
                if (finalUrlHeader) {
                    response.uri = finalUrlHeader;
                    state.shakaProxyRewriteContext = { ...state.shakaProxyRewriteContext, upstreamManifestUrl: finalUrlHeader };
                    pushDiagnosticEvent(null, {
                        type: 'shaka-manifest-response',
                        level: 'info',
                        player: 'shaka',
                        url: finalUrlHeader,
                        message: '代理 manifest 响应已替换为上游真实地址',
                        meta: {
                            responseUriBeforeRewrite,
                            responseUriAfterRewrite: String(response.uri || ''),
                            finalUrlHeader
                        }
                    });
                } else {
                    pushDiagnosticEvent(null, {
                        type: 'shaka-manifest-response',
                        level: 'warn',
                        player: 'shaka',
                        url: responseUriBeforeRewrite,
                        message: '代理 manifest 响应未提供 X-Final-Url',
                        meta: { responseUriBeforeRewrite }
                    });
                }
            } catch (error) { /* ignore */ }
        });
    }

    state.overlay.configure({
        addBigPlayButton: true,
        controlPanelElements: ["play_pause", "time_and_duration", "spacer", "mute", "volume", "fullscreen", "overflow_menu"],
        overflowMenuButtons: ["quality", "language", "captions", "picture_in_picture"]
    });

    state.player.addEventListener("error", (event) => {
        const detail = event.detail || event;
        const activePlayer = String(state.currentPlayerType || "").trim().toLowerCase();
        if (activePlayer && activePlayer !== "shaka") return;
        if (elements.statusText) elements.statusText.textContent = formatPlaybackError(detail);
    });
    
    // 性能监控
    state.player.addEventListener('loaded', () => {
        const loadTime = performance.now() - startTime;
        console.log(`[Shaka] 播放器加载完成，耗时：${loadTime.toFixed(0)}ms`);
    });
    
    state.player.addEventListener('playing', () => {
        const playTime = performance.now() - startTime;
        console.log(`[Shaka] 开始播放，总耗时：${playTime.toFixed(0)}ms`);
    });
}

function rewriteShakaProxyRelativeUri(uri) {
    const raw = String(uri || '').trim();
    if (!raw || !state.shakaProxyRewriteContext.enabled) return raw;
    if (/^(data:|blob:|file:)/i.test(raw) || raw.includes('/m3u-proxy?url=')) return raw;

    try {
        const upstreamManifestUrl = state.shakaProxyRewriteContext.upstreamManifestUrl || '';
        const upstreamOrigin = state.shakaProxyRewriteContext.upstreamOrigin || '';
        const baseUrl = upstreamManifestUrl || upstreamOrigin || window.location.href;
        let parsed = new URL(raw, baseUrl);

        if (parsed.origin === window.location.origin) {
            const lowerPath = String(parsed.pathname || '').toLowerCase();
            if (lowerPath.includes('/m3u-proxy')) return raw;

            if (upstreamOrigin) {
                const isHttpMediaPath = /^\/(?:\d+|__cl|__c|__op|__f|seg-|dash\/|media\/)/i.test(String(parsed.pathname || ''));
                if (isHttpMediaPath) {
                    parsed = new URL(`${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`, upstreamOrigin);
                }
            }
        }

        const absoluteTarget = parsed.toString();
        if (!/^https?:\/\//i.test(absoluteTarget)) return raw;

        return toSameOriginM3UProxyUrl(absoluteTarget) || absoluteTarget;
    } catch { return raw; }
}
