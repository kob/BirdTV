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
    
    if (!window.shaka) {
        console.warn('[shaka-init] window.shaka 未加载');
        if (elements.statusText) elements.statusText.textContent = '播放器库加载失败';
        return false;
    }

    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) { if (elements.statusText) elements.statusText.textContent = '浏览器不支持 Shaka'; return false; }

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

    // 创建 Player 实例
    const videoEl = elements.video;
    const containerEl = videoEl ? videoEl.parentElement : null;

    // 先创建 Player，attach 到 video
    state.player = new shaka.Player();
    await state.player.attach(videoEl);

    // 创建 Overlay（UI）
    if (containerEl && shaka.ui && shaka.ui.Overlay) {
        state.overlay = new shaka.ui.Overlay(state.player, containerEl, videoEl);
    }

    // 优化配置：针对直播场景优化首屏速度
    try {
        state.player.configure({
            manifest: { 
                retryParameters: SHAKA_RETRY, 
                defaultPresentationDelay: 0,
                availabilityWindowOverride: 30,
                disableAudio: false,
                disableVideo: false
            },
            drm: { retryParameters: SHAKA_RETRY },
            streaming: { 
                retryParameters: SHAKA_RETRY, 
                stallEnabled: true, 
                stallThreshold: 2,
                stallSkip: 0.1, 
                safeSeekOffset: 3,
                rebufferingGoal: 5,
                bufferingGoal: 5,
                bufferBehind: 20,
                ignoreTextStreamFailures: true
            },
            abr: { 
                enabled: true,
                defaultBandwidthEstimate: 5000000,
                switchInterval: 2,
                bandwidthDowngradeTarget: 0.95,
                bandwidthUpgradeTarget: 0.85
            }
        });
    } catch (e) {
        console.warn('[shaka-init] 播放器配置出错（非致命）:', e.message || e);
    }

    // 设置 textDisplayFactory 为 NativeTextDisplayer（支持图形字幕/DVB字幕）
    try {
        if (shaka.text && shaka.text.NativeTextDisplayer) {
            state.player.configure('textDisplayFactory', shaka.text.NativeTextDisplayer);
        }
    } catch (e) {
        console.warn('[shaka-init] textDisplayFactory 设置跳过:', e.message || e);
    }

    const networkingEngine = state.player.getNetworkingEngine();
    if (networkingEngine) {
        networkingEngine.registerRequestFilter((type, request) => {
            const token = localStorage.getItem('authToken');
            if (Array.isArray(request?.uris) && request.uris.length > 0) {
                request.uris = request.uris.map(uri => rewriteShakaProxyRelativeUri(uri));
                if (request.uris.some(uri => String(uri).includes('/m3u-proxy?url=')) && token) {
                    request.headers = request.headers || {};
                    request.headers['Authorization'] = `Bearer ${token}`;
                }
            }
            if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
                request.headers = request.headers || {};
                for (const [k, v] of Object.entries(state.shakaLicenseHeaders || {})) request.headers[k] = v;
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

    // 配置 Overlay UI
    if (state.overlay) {
        try {
            state.overlay.configure({
                controlPanelElements: ["play_pause", "time_and_duration", "spacer", "mute", "volume", "fullscreen", "overflow_menu"],
                overflowMenuButtons: ["quality", "language", "captions", "picture_in_picture"]
            });
        } catch (e) {
            console.warn('[shaka-init] Overlay 配置出错（非致命）:', e.message || e);
        }
    }

    state.player.addEventListener("error", (event) => {
        const detail = event.detail || event;
        const activePlayer = String(state.currentPlayerType || "").trim().toLowerCase();
        if (activePlayer && activePlayer !== "shaka") return;
        if (elements.statusText) elements.statusText.textContent = formatPlaybackError(detail);
    });
    
    // 性能监控 & 自动启用字幕
    state.player.addEventListener('loaded', () => {
        const loadTime = performance.now() - startTime;
        console.log(`[Shaka] 播放器加载完成，耗时：${loadTime.toFixed(0)}ms`);
        try {
            const textTracks = state.player.getTextTracks();
            if (textTracks && textTracks.length > 0) {
                state.player.selectTextTrack(textTracks[0]);
                try {
                    state.player.setTextTrackVisibility(true);
                } catch (e2) { /* ignore */ }
                console.log(`[Shaka] 已自动启用字幕: ${textTracks[0].language || textTracks[0].label || 'unknown'}`);
            }
        } catch (e) {
            console.warn('[Shaka] 自动启用字幕失败:', e.message || e);
        }
    });
    
    state.player.addEventListener('playing', () => {
        const playTime = performance.now() - startTime;
        console.log(`[Shaka] 开始播放，总耗时：${playTime.toFixed(0)}ms`);
    });

    return true;
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
