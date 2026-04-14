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

    // 字幕状态管理
    let currentCues = [];
    let lastCueUpdateTime = 0;
    let displayerCreated = false;
    
    // 创建字幕显示组件
    const createSubtitleDisplayer = () => {
        displayerCreated = true;
        console.log('[Shaka] ★ createSubtitleDisplayer() 被调用!');
        return {
            append: (cue) => {
                const now = performance.now();
                if (now - lastCueUpdateTime > 100) {
                    currentCues = [];
                }
                currentCues.push(cue);
                lastCueUpdateTime = now;
                console.log('[Shaka] ★ 字幕 cue 已添加! startTime:', cue.startTime, 'endTime:', cue.endTime, 'text:', (cue.text || '').substring(0, 50));
                console.log('[Shaka] 当前 cue 数组长度:', currentCues.length);
            },
            remove: () => {
                console.log('[Shaka] 字幕 remove() 被调用');
                currentCues = [];
            },
            destroy: () => {
                console.log('[Shaka] 字幕 destroy() 被调用');
                currentCues = [];
            }
        };
    };
    
    // 字幕 URL 缓存
    let currentSubtitleUrl = null;
    
    // 尝试通过 TextEngine 设置 displayer
    console.log('[Shaka] 检查 TextEngine API...');
    console.log('[Shaka] getTextEngine 类型:', typeof state.player.getTextEngine);
    
    try {
        const textEngine = state.player.getTextEngine?.();
        console.log('[Shaka] TextEngine 获取结果:', textEngine ? '存在' : 'null/undefined');
        
        if (textEngine) {
            console.log('[Shaka] TextEngine 方法:', Object.keys(textEngine).join(', '));
        }
        
        if (textEngine && typeof textEngine.setDisplayer === 'function') {
            console.log('[Shaka] 通过 TextEngine.setDisplayer 设置');
            textEngine.setDisplayer(createSubtitleDisplayer());
        } else {
            console.log('[Shaka] TextEngine 不可用');
        }
    } catch (e) {
        console.warn('[Shaka] TextEngine 设置失败:', e.message);
    }
    
    // 解析 TTML 时间格式
    const parseTTMLTime = (timeStr) => {
        if (!timeStr) return 0;
        const match = timeStr.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        }
        return 0;
    };
    
    // 解析 TTML XML
    const parseTTML = (xmlString) => {
        const cues = [];
        try {
            const parser = new DOMParser();
            const xml = parser.parseFromString(xmlString, 'text/xml');
            const paragraphs = xml.querySelectorAll('p');
            console.log('[Shaka] TTML 段落数:', paragraphs.length);
            
            paragraphs.forEach((p, index) => {
                const startTime = parseTTMLTime(p.getAttribute('begin') || '0');
                const endTime = parseTTMLTime(p.getAttribute('end') || '0');
                const text = p.textContent?.trim() || '';
                if (text) {
                    cues.push({ startTime, endTime, text });
                    if (index < 3) {
                        console.log(`[Shaka] TTML cue[${index}]: ${startTime}s - ${endTime}s: "${text.substring(0, 30)}..."`);
                    }
                }
            });
        } catch (e) {
            console.warn('[Shaka] TTML 解析失败:', e.message);
        }
        return cues;
    };
    
    // 从 Manifest 获取字幕 URL 并加载
    const loadSubtitlesFromManifest = async () => {
        try {
            const manifest = state.player.getManifest?.();
            if (!manifest) {
                console.log('[Shaka] Manifest 获取失败');
                return;
            }
            console.log('[Shaka] Manifest 获取成功');
            
            // 直接遍历 manifest.textStreams
            const textStreams = manifest?.textStreams || [];
            console.log('[Shaka] manifest.textStreams:', textStreams.length);
            
            // 检查每个文本流
            for (let i = 0; i < textStreams.length; i++) {
                const stream = textStreams[i];
                console.log(`[Shaka] 文本流[${i}]:`, {
                    mimeType: stream.mimeType,
                    language: stream.language,
                    label: stream.label,
                    url: stream.url ? stream.url.substring(0, 80) + '...' : '无URL',
                    id: stream.id,
                    type: stream.type
                });
                
                // 如果有 URL，尝试加载
                if (stream.url && !currentSubtitleUrl) {
                    currentSubtitleUrl = stream.url;
                    console.log('[Shaka] 加载字幕文件:', stream.url);
                    try {
                        const response = await fetch(stream.url);
                        const content = await response.text();
                        currentCues = parseTTML(content);
                        console.log('[Shaka] 解析 TTML cue 数:', currentCues.length);
                    } catch (e) {
                        console.warn('[Shaka] 字幕加载失败:', e.message);
                    }
                }
            }
            
            // 检查是否嵌入在 MP4 中（没有 URL）
            if (!currentSubtitleUrl) {
                console.log('[Shaka] 字幕嵌入在 MP4 容器中，无独立 URL');
                console.log('[Shaka] 需要使用其他方法提取 MP4 中的字幕');
                
                // 尝试获取当前选中的字幕轨道
                const textTracks = state.player.getTextTracks();
                console.log('[Shaka] 当前字幕轨道数:', textTracks.length);
                for (const track of textTracks) {
                    console.log(`[Shaka] 轨道: ${track.label || track.language}, active=${track.active}`);
                }
            }
        } catch (e) {
            console.warn('[Shaka] 获取字幕失败:', e.message);
        }
    };

    // 创建字幕更新循环
    let subtitleLoopId = null;
    const updateSubtitles = () => {
        if (!state.player || !videoEl) {
            subtitleLoopId = null;
            return;
        }
        
        const currentTime = videoEl.currentTime;
        let activeCue = null;
        
        for (const cue of currentCues) {
            if (cue.startTime <= currentTime && cue.endTime >= currentTime) {
                activeCue = cue;
                break;
            }
        }
        
        subtitleContainer.innerHTML = '';
        if (activeCue) {
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
            cueDiv.textContent = activeCue.text || '';
            subtitleContainer.appendChild(cueDiv);
        }
        
        subtitleLoopId = requestAnimationFrame(updateSubtitles);
    };
    
    // 启动字幕循环
    const startSubtitleLoop = () => {
        if (!subtitleLoopId) {
            console.log('[Shaka] 启动字幕更新循环');
            subtitleLoopId = requestAnimationFrame(updateSubtitles);
        }
    };

    // 创建 Overlay（UI）

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
        
        // 启动字幕循环
        startSubtitleLoop();
        
        // 尝试从 Manifest 获取字幕 URL 并解析 TTML
        loadSubtitlesFromManifest();
        
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
                console.log(`[Shaka] 已自动启用字幕: ${textTracks[0].language || textTracks[0].label || 'unknown'}`);
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
    
    state.player.addEventListener('textchanged', () => {
        console.log('[Shaka] ★ 文本流已改变');
        currentCues = [];
        startSubtitleLoop();
        
        // 尝试获取活跃流的信息
        try {
            const textTracks = state.player.getTextTracks();
            for (const track of textTracks) {
                if (track.active) {
                    console.log('[Shaka] 活跃字幕轨道:', {
                        type: track.type,
                        mimeType: track.mimeType,
                        language: track.language,
                        label: track.label,
                        id: track.id
                    });
                    
                    // 尝试获取流对象
                    const stream = state.player.getActiveStream?.();
                    console.log('[Shaka] getActiveStream 结果:', stream);
                    if (stream) {
                        console.log('[Shaka] Stream 详情:', {
                            id: stream.id,
                            type: stream.type,
                            mimeType: stream.mimeType,
                            language: stream.language,
                            url: stream.url ? '有URL' : '无URL'
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('[Shaka] textchanged 诊断失败:', e.message);
        }
    });
    
    // 延迟检查字幕状态
    setTimeout(() => {
        console.log('[Shaka] === 延迟检查字幕状态 ===');
        try {
            const textTracks = state.player.getTextTracks();
            console.log(`[Shaka] 字幕轨道数: ${textTracks.length}`);
            console.log(`[Shaka] displayerCreated: ${displayerCreated}`);
            
            for (let i = 0; i < textTracks.length; i++) {
                const track = textTracks[i];
                console.log(`[Shaka] 轨道[${i}]: active=${track.active}, mimeType=${track.mimeType}, language=${track.language}`);
            }
            
            const container = containerEl?.querySelector('.shaka-text-container');
            if (container) {
                console.log(`[Shaka] 字幕容器 childCount: ${container.children.length}`);
            }
            
            // 检查 video.textTracks 和 cues
            if (videoEl?.textTracks) {
                console.log(`[Shaka] video.textTracks 数量: ${videoEl.textTracks.length}`);
                for (let i = 0; i < videoEl.textTracks.length; i++) {
                    const vt = videoEl.textTracks[i];
                    console.log(`[Shaka] video.textTracks[${i}]: mode=${vt.mode}, label=${vt.label}, cues=${vt.cues?.length || 0}`);
                }
            }
        } catch (e) {
            console.warn('[Shaka] 延迟检查失败:', e.message);
        }
    }, 5000);
    
    state.player.addEventListener('playing', () => {
        const playTime = performance.now() - startTime;
        console.log(`[Shaka] ★ playing 事件触发，总耗时：${playTime.toFixed(0)}ms`);
        console.log(`[Shaka] displayerCreated: ${displayerCreated}`);
        console.log(`[Shaka] 字幕循环状态: ${subtitleLoopId ? '运行中' : '未启动'}`);
        console.log(`[Shaka] 当前存储 cue 数: ${currentCues.length}`);
        
        // 强制检查字幕状态
        try {
            const textTracks = state.player.getTextTracks();
            for (let i = 0; i < textTracks.length; i++) {
                const track = textTracks[i];
                console.log(`[Shaka] playing时字幕轨道[${i}]: active=${track.active}, mimeType=${track.mimeType}`);
            }
        } catch (e) {
            console.warn('[Shaka] 检查字幕轨道失败:', e.message);
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
