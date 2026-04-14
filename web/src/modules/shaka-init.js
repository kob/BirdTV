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

    // 创建字幕容器（用于 TTML/文本字幕渲染）
    let subtitleContainer = containerEl?.querySelector('.shaka-text-container');
    if (!subtitleContainer) {
        subtitleContainer = document.createElement('div');
        subtitleContainer.className = 'shaka-text-container';
        subtitleContainer.style.cssText = `
            position: absolute;
            left: 5%;
            right: 5%;
            bottom: 10%;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            z-index: 10;
        `;
        containerEl?.appendChild(subtitleContainer);
        console.log('[Shaka] 已创建字幕容器');
    }

    // 先创建 Player
    state.player = new shaka.Player();

    // attach 到 video
    await state.player.attach(videoEl);

    // 设置 TextDisplayer（在 attach 之后）
    if (shaka.text && shaka.text.SimpleTextDisplayer) {
        state.player.createTextDisplayer = () => {
            console.log('[Shaka] 创建 SimpleTextDisplayer');
            const displayer = new shaka.text.SimpleTextDisplayer(subtitleContainer);
            return displayer;
        };
    }

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
                alwaysStreamTextOn: true,
                ignoreTextStreamFailures: false
            },
            abr: { 
                enabled: true,
                defaultBandwidthEstimate: 5000000,
                switchInterval: 2,
                bandwidthDowngradeTarget: 0.95,
                bandwidthUpgradeTarget: 0.85
            }
        });
        
        // 注册 MP4 TTML 解析器
        if (shaka.text && shaka.text.TtmlParser) {
            console.log('[Shaka] TTML 解析器已可用');
        }
    } catch (e) {
        console.warn('[shaka-init] 播放器配置出错（非致命）:', e.message || e);
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
        
        // 调试字幕
        try {
            const textTracks = state.player.getTextTracks();
            console.log(`[Shaka] 字幕轨道数量: ${textTracks?.length || 0}`);
            
            if (textTracks && textTracks.length > 0) {
                // 打印所有轨道详情
                for (let i = 0; i < textTracks.length; i++) {
                    const track = textTracks[i];
                    console.log(`[Shaka] 字幕轨道[${i}]: type=${track.type}, mimeType=${track.mimeType}, language=${track.language}, kind=${track.kind}`);
                }
                
                state.player.selectTextTrack(textTracks[0]);
                
                // 尝试多种方法启用字幕
                if (typeof state.player.setTextTrackVisibility === 'function') {
                    state.player.setTextTrackVisibility(true);
                } else if (typeof state.player.setTextVisibility === 'function') {
                    state.player.setTextVisibility(true);
                }
                
                console.log(`[Shaka] 已自动启用字幕: ${textTracks[0].language || textTracks[0].label || 'unknown'}`);
                
                // 检查字幕容器内容
                setTimeout(() => {
                    const container = containerEl?.querySelector('.shaka-text-container');
                    if (container) {
                        console.log(`[Shaka] 字幕容器 childCount: ${container.children.length}`);
                        console.log(`[Shaka] 字幕容器 HTML: ${container.innerHTML.substring(0, 300)}`);
                    }
                }, 3000);
            }
            
            // 检查字幕容器
            const container = containerEl?.querySelector('.shaka-text-container');
            if (container) {
                console.log(`[Shaka] 字幕容器已创建，z-index: ${container.style.zIndex}`);
            }
        } catch (e) {
            console.warn('[Shaka] 自动启用字幕失败:', e.message || e);
        }
    });
    
    // 监听字幕轨道变化
    state.player.addEventListener('trackschanged', () => {
        console.log('[Shaka] 字幕轨道列表已变化');
        const textTracks = state.player.getTextTracks();
        for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i];
            console.log(`[Shaka] 轨道[${i}]: type=${track.type}, mimeType=${track.mimeType}, active=${track.active}`);
        }
    });
    
    // 监听文本流变化
    state.player.addEventListener('textchanged', () => {
        console.log('[Shaka] 文本流已改变');
        try {
            const activeTextStream = state.player.getText();
            console.log('[Shaka] 当前文本流:', activeTextStream);
            console.log('[Shaka] 文本流 mimeType:', activeTextStream?.mimeType);
            console.log('[Shaka] 文本流 language:', activeTextStream?.language);
        } catch (e) {
            console.warn('[Shaka] 获取文本流失败:', e.message);
        }
    });
    
    // 监听 adaptation 变化（轨道切换）
    state.player.addEventListener('adaptation', () => {
        console.log('[Shaka] Adaptation 事件触发');
        const textTracks = state.player.getTextTracks();
        console.log(`[Shaka] 当前字幕轨道数: ${textTracks.length}`);
    });
    
    // 延迟检查字幕状态
    setTimeout(() => {
        console.log('[Shaka] === 延迟检查字幕状态 ===');
        try {
            const textTracks = state.player.getTextTracks();
            console.log(`[Shaka] 字幕轨道数: ${textTracks.length}`);
            
            for (let i = 0; i < textTracks.length; i++) {
                const track = textTracks[i];
                console.log(`[Shaka] 轨道[${i}]: ${JSON.stringify({
                    type: track.type,
                    mimeType: track.mimeType,
                    language: track.language,
                    active: track.active,
                    id: track.id
                })}`);
            }
            
            const container = containerEl?.querySelector('.shaka-text-container');
            if (container) {
                console.log(`[Shaka] 字幕容器 childCount: ${container.children.length}`);
                console.log(`[Shaka] 字幕容器 innerHTML: "${container.innerHTML.substring(0, 200)}"`);
            }
            
            // 检查 video.textTracks 和 cues
            if (videoEl?.textTracks) {
                console.log(`[Shaka] video.textTracks 数量: ${videoEl.textTracks.length}`);
                for (let i = 0; i < videoEl.textTracks.length; i++) {
                    const vt = videoEl.textTracks[i];
                    console.log(`[Shaka] video.textTracks[${i}]: mode=${vt.mode}, label=${vt.label}, language=${vt.language}`);
                    if (vt.cues && vt.cues.length > 0) {
                        console.log(`[Shaka] video.textTracks[${i}] cues 数量: ${vt.cues.length}`);
                        for (let j = 0; j < Math.min(vt.cues.length, 3); j++) {
                            console.log(`[Shaka] cue[${j}]: "${vt.cues[j].text?.substring(0, 50)}"`);
                        }
                    }
                }
            }
            
            // 检查 Shaka 内部状态
            console.log(`[Shaka] isTextTrackVisible: ${state.player.isTextTrackVisible()}`);
        } catch (e) {
            console.warn('[Shaka] 延迟检查失败:', e.message);
        }
    }, 5000);
    
    state.player.addEventListener('playing', () => {
        const playTime = performance.now() - startTime;
        console.log(`[Shaka] 开始播放，总耗时：${playTime.toFixed(0)}ms`);
        
        // 监听原生字幕 cuechange
        if (videoEl?.textTracks) {
            videoEl.textTracks.addEventListener('cuechange', () => {
                console.log('[Shaka] 原生 cuechange 触发');
                subtitleContainer.innerHTML = '';
                
                for (let i = 0; i < videoEl.textTracks.length; i++) {
                    const track = videoEl.textTracks[i];
                    if (track.mode === 'showing' && track.cues) {
                        console.log(`[Shaka] track[${i}] cues: ${track.cues.length}`);
                        for (let j = 0; j < track.cues.length; j++) {
                            const cue = track.cues[j];
                            if (cue.startTime <= videoEl.currentTime && cue.endTime >= videoEl.currentTime) {
                                console.log(`[Shaka] 活动 cue: "${cue.text?.substring(0, 50)}"`);
                                
                                const cueDiv = document.createElement('div');
                                cueDiv.style.cssText = `
                                    background: rgba(0, 0, 0, 0.75);
                                    color: white;
                                    padding: 4px 12px;
                                    border-radius: 4px;
                                    font-size: 18px;
                                    text-align: center;
                                    max-width: 80%;
                                    margin: 0 auto;
                                `;
                                cueDiv.textContent = cue.text;
                                subtitleContainer.appendChild(cueDiv);
                            }
                        }
                    }
                }
            });
            console.log('[Shaka] 已添加原生 cuechange 监听');
        }
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
