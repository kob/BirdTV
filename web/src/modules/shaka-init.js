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
                    type: stream.type,
                    codecs: stream.codecs
                });
                
                // 检查 stream 的完整属性（用于调试）
                console.log(`[Shaka] Stream[${i}] 完整属性:`, Object.keys(stream));
                
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
                console.log('[Shaka] 尝试通过 createSegmentIndex 获取字幕数据...');
                
                // 首先尝试通过 createSegmentIndex 获取
                await extractSubtitlesViaSegmentIndex(textStreams);
                
                if (currentCues.length > 0) {
                    console.log('[Shaka] 通过 createSegmentIndex 成功获取字幕');
                    return;
                }
                
                console.log('[Shaka] createSegmentIndex 方法未获取到字幕，尝试 manifest 深层结构...');
                
                // 尝试获取 DASH manifest 中的 AdaptationSet
                let subtitleSegmentUrl = null;
                
                // 检查 manifest.variants 是否有 baseUrl
                const variants = manifest?.variants || [];
                if (variants.length > 0) {
                    console.log('[Shaka] Variants 数量:', variants.length);
                    const variant = variants[0];
                    if (variant.baseUrl) {
                        console.log('[Shaka] Variant baseUrl:', variant.baseUrl);
                    }
                    if (variant.video) {
                        console.log('[Shaka] Variant video:', {
                            baseUrl: variant.video.baseUrl,
                            mimeType: variant.video.mimeType
                        });
                    }
                }
                
                // 检查 textStreams 是否有更多信息
                for (let i = 0; i < textStreams.length; i++) {
                    const stream = textStreams[i];
                    
                    // 检查是否有 segmentTemplate 或 segmentList
                    if (stream.segmentTemplate) {
                        console.log(`[Shaka] Stream[${i}] 有 SegmentTemplate:`, stream.segmentTemplate);
                    }
                    if (stream.segmentList) {
                        console.log(`[Shaka] Stream[${i}] 有 SegmentList`);
                    }
                    if (stream.baseUrl) {
                        console.log(`[Shaka] Stream[${i}] baseUrl:`, stream.baseUrl);
                        if (!subtitleSegmentUrl && stream.baseUrl.startsWith('http')) {
                            subtitleSegmentUrl = stream.baseUrl;
                        }
                    }
                    if (stream.initSegmentUrl) {
                        console.log(`[Shaka] Stream[${i}] initSegmentUrl:`, stream.initSegmentUrl);
                    }
                }
                
                // 尝试获取视频流 URL（用于 MP4box 解析）
                let videoMp4Url = null;
                
                // 检查视频流
                const videoStreams = manifest?.videoStreams || [];
                for (const stream of videoStreams) {
                    console.log(`[Shaka] 视频流: mimeType=${stream.mimeType}, url=${stream.url ? '有' : '无'}`);
                    if (stream.url && stream.url.startsWith('http')) {
                        videoMp4Url = stream.url;
                        break;
                    }
                    if (stream.baseUrl && stream.baseUrl.startsWith('http')) {
                        videoMp4Url = stream.baseUrl;
                        break;
                    }
                }
                
                if (subtitleSegmentUrl) {
                    console.log('[Shaka] 找到字幕 baseUrl:', subtitleSegmentUrl);
                    // 尝试获取第一个 segment
                    await extractSubtitlesFromMP4(subtitleSegmentUrl, textStreams);
                } else if (videoMp4Url) {
                    console.log('[Shaka] 找到视频流 URL，使用 MP4box 提取字幕');
                    await extractSubtitlesFromMP4(videoMp4Url, textStreams);
                } else {
                    console.log('[Shaka] 无法获取任何流 URL');
                    
                    // 尝试从 videoEl.src 获取（可能是代理 URL）
                    const mediaSrc = videoEl?.src || '';
                    if (mediaSrc && !mediaSrc.startsWith('blob:') && mediaSrc.startsWith('http')) {
                        console.log('[Shaka] 使用 videoEl.src 提取字幕...');
                        await extractSubtitlesFromMP4(mediaSrc, textStreams);
                    } else {
                        console.log('[Shaka] videoEl.src 是 blob URL 或无效，无法提取');
                    }
                }
                
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
    
    // 尝试通过 Shaka 的 createSegmentIndex 获取字幕数据
    const extractSubtitlesViaSegmentIndex = async (textStreams) => {
        console.log('[Shaka] 尝试通过 createSegmentIndex 获取字幕...');
        
        for (let i = 0; i < textStreams.length; i++) {
            const stream = textStreams[i];
            
            if (typeof stream.createSegmentIndex === 'function') {
                console.log(`[Shaka] Stream[${i}] 有 createSegmentIndex 方法`);
                
                try {
                    // 创建段索引
                    await stream.createSegmentIndex();
                    console.log(`[Shaka] Stream[${i}] 段索引创建成功`);
                    
                    // 获取段信息
                    const getInitSegment = stream.getSegmentReference?.(0);
                    if (getInitSegment) {
                        console.log(`[Shaka] Stream[${i}] 初始段:`, getInitSegment);
                    }
                    
                    // 尝试获取第一个字幕 segment
                    const segmentRef = stream.getSegmentReference?.(1);
                    if (segmentRef) {
                        console.log(`[Shaka] Stream[${i}] Segment[1]:`, segmentRef);
                        
                        // 获取 segment 数据
                        if (segmentRef.getUris && segmentRef.getUris().length > 0) {
                            const segmentUrl = segmentRef.getUris()[0];
                            console.log(`[Shaka] 正在获取字幕 segment: ${segmentUrl}`);
                            
                            const response = await fetch(segmentUrl);
                            const arrayBuffer = await response.arrayBuffer();
                            console.log(`[Shaka] 获取到字幕数据，大小: ${arrayBuffer.byteLength}`);
                            
                            // 使用 Shaka 的 TtmlTextParser 解析
                            if (shaka.text && shaka.text.TtmlParser) {
                                const parser = new shaka.text.TtmlParser();
                                const parsedCues = parser.parseMedia(arrayBuffer, {
                                    stream: stream,
                                    manifestType: 'DASH'
                                });
                                console.log(`[Shaka] TtmlTextParser 解析 cue 数: ${parsedCues?.length || 0}`);
                                
                                if (parsedCues && parsedCues.length > 0) {
                                    // 转换 cue 格式
                                    for (const cue of parsedCues) {
                                        currentCues.push({
                                            startTime: cue.startTime,
                                            endTime: cue.endTime,
                                            text: cue.payload || ''
                                        });
                                    }
                                    console.log(`[Shaka] 通过 TtmlTextParser 转换了 ${currentCues.length} 个 cue`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[Shaka] Stream[${i}] 段索引创建失败:`, e.message);
                }
            }
        }
    };
    
    // 从 MP4 容器中提取字幕（需要 MP4box.js）
    const extractSubtitlesFromMP4 = async (mp4Url, textStreams) => {
        if (!window.MP4Box) {
            console.log('[Shaka] MP4box.js 未加载，跳过 MP4 字幕提取');
            return;
        }
        
        console.log('[Shaka] 使用 MP4box.js 提取字幕...');
        
        try {
            // 获取 MP4box 配置
            const MP4Box = window.MP4Box;
            const mp4boxFile = MP4Box.createFile();
            
            // 用于存储提取的字幕
            const extractedCues = [];
            
            // 设置回调
            mp4boxFile.onReady = (info) => {
                console.log('[Shaka] MP4box 解析完成，轨道数:', info.tracks.length);
                
                // 查找字幕轨道
                for (const track of info.tracks) {
                    console.log(`[Shaka] MP4box 轨道: id=${track.id}, type=${track.type}, codec=${track.codec}`);
                    
                    // 检查是否是字幕轨道（可能是 stpp, wvtt, tx3g 等）
                    if (track.type === 'subtitle' || 
                        track.codec?.includes('stpp') || 
                        track.codec?.includes('wvtt') ||
                        track.codec?.includes('tx3g')) {
                        console.log(`[Shaka] 发现字幕轨道: id=${track.id}, codec=${track.codec}`);
                        
                        // 设置提取选项
                        mp4boxFile.setExtractionOptions(track.id, null, { nbSamples: 500 });
                    }
                }
                
                mp4boxFile.start();
            };
            
            // 提取字幕样本
            mp4boxFile.onSamples = (id, user, samples) => {
                console.log(`[Shaka] 字幕样本数: ${samples.length}`);
                
                for (const sample of samples) {
                    if (sample.data) {
                        // stpp (TTML) 格式
                        if (sample.timescale) {
                            const data = new Uint8Array(sample.data);
                            const text = new TextDecoder('utf-8').decode(data);
                            
                            // 解析 TTML XML
                            try {
                                const parser = new DOMParser();
                                const xml = parser.parseFromString(text, 'text/xml');
                                const paragraphs = xml.querySelectorAll('p');
                                
                                for (const p of paragraphs) {
                                    const begin = parseTTMLTime(p.getAttribute('begin') || '0');
                                    const end = parseTTMLTime(p.getAttribute('end') || '0');
                                    const content = p.textContent?.trim() || '';
                                    
                                    if (content) {
                                        extractedCues.push({
                                            startTime: begin,
                                            endTime: end,
                                            text: content
                                        });
                                    }
                                }
                            } catch (e) {
                                // 如果不是 XML，直接使用文本
                                extractedCues.push({
                                    startTime: sample.cts / sample.timescale,
                                    endTime: (sample.cts + sample.duration) / sample.timescale,
                                    text: text.trim()
                                });
                            }
                        }
                    }
                }
                
                console.log(`[Shaka] 已提取 ${extractedCues.length} 个字幕 cue`);
                
                // 如果有提取的字幕，使用它们
                if (extractedCues.length > 0) {
                    currentCues = extractedCues;
                    console.log('[Shaka] MP4box 字幕提取成功!');
                }
            };
            
            // 获取 MP4 数据
            console.log('[Shaka] 正在获取 MP4 数据:', mp4Url.substring(0, 100));
            const response = await fetch(mp4Url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            console.log('[Shaka] 获取到 MP4 数据，大小:', arrayBuffer.byteLength);
            
            // 告诉 MP4box 这是一个流
            arrayBuffer.fileStart = 0;
            mp4boxFile.appendBuffer(arrayBuffer);
            mp4boxFile.flush();
            
        } catch (e) {
            console.warn('[Shaka] MP4box 字幕提取失败:', e.message);
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
        
        // 检查可用的文本解析器
        console.log('[Shaka] 可用的文本解析器:', Object.keys(shaka.text || {}).join(', '));
        
        // 注册 MP4 TTML 解析器
        if (shaka.text && shaka.text.TtmlParser) {
            console.log('[Shaka] TTML 解析器已可用');
        }
        
        // 尝试注册 MP4 字幕解析器
        if (shaka.text && shaka.text.Mp4Parser) {
            console.log('[Shaka] MP4 字幕解析器已可用');
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
        
        // ★ 深度调试字幕
        try {
            const textTracks = state.player.getTextTracks();
            console.log(`[Shaka] 字幕轨道数量: ${textTracks?.length || 0}`);
            
            if (textTracks && textTracks.length > 0) {
                // 打印所有轨道详情
                for (let i = 0; i < textTracks.length; i++) {
                    const track = textTracks[i];
                    console.log(`[Shaka] 字幕轨道[${i}]: type=${track.type}, mimeType=${track.mimeType}, language=${track.language}, kind=${track.kind}`);
                }
                
                // ★ 启用字幕
                state.player.selectTextTrack(textTracks[0]);
                console.log(`[Shaka] 已调用 selectTextTrack 启用字幕`);
            }
            
            // 检查字幕容器
            const container = containerEl?.querySelector('.shaka-text-container');
            if (container) {
                console.log(`[Shaka] 字幕容器已创建，z-index: ${container.style.zIndex}`);
            }
            
            // 检查 video.textTracks 的初始状态
            setTimeout(() => {
                if (videoEl?.textTracks) {
                    console.log(`[Shaka] loaded 后 500ms video.textTracks 状态:`);
                    for (let i = 0; i < videoEl.textTracks.length; i++) {
                        const vt = videoEl.textTracks[i];
                        console.log(`[Shaka]   轨道[${i}]: mode=${vt.mode}, label=${vt.label}, cues=${vt.cues?.length || 0}`);
                    }
                }
            }, 500);
            
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
        
        // 尝试通过 textStream 事件获取更多信息
        try {
            // 检查 player 的 streamingEngine
            const streamingEngine = state.player.getStreamingEngine?.();
            if (streamingEngine) {
                console.log('[Shaka] StreamingEngine 可用');
            }
            
            // 检查 mediaSource
            const mediaSource = state.player.getMediaElement?.()?.src;
            console.log('[Shaka] MediaElement src:', mediaSource ? '已设置' : '未设置');
        } catch (e) {
            console.warn('[Shaka] 轨道变化诊断失败:', e.message);
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
                    
                    // 如果 cues 为 0，尝试获取更多诊断信息
                    if (vt.cues?.length === 0) {
                        console.log(`[Shaka] 轨道[${i}] cue 事件监听检查...`);
                        // 尝试监听 cuechange 事件
                        vt.oncuechange = () => {
                            console.log(`[Shaka] ★ cuechange 事件触发! cues=${vt.cues?.length || 0}`);
                        };
                    }
                }
            }
            
            // 检查 player 的内部状态
            try {
                const manifest = state.player.getManifest?.();
                if (manifest) {
                    const textStreams = manifest?.textStreams || [];
                    console.log(`[Shaka] Manifest textStreams: ${textStreams.length}`);
                    
                    // 检查每个流的解析器类型
                    for (let i = 0; i < textStreams.length; i++) {
                        const stream = textStreams[i];
                        console.log(`[Shaka] Stream[${i}]: mimeType=${stream.mimeType}, codec=${stream.codecs || 'N/A'}`);
                    }
                }
            } catch (e) {
                console.warn('[Shaka] Manifest 检查失败:', e.message);
            }
            
            // ★ 检查 streaming engine 状态
            try {
                const streamingEngine = state.player.getStreamingEngine?.();
                if (streamingEngine) {
                    console.log('[Shaka] StreamingEngine 可用');
                    
                    // 检查是否有文本流缓冲
                    if (streamingEngine.getTextBuffersInfo) {
                        const textBuffers = streamingEngine.getTextBuffersInfo?.();
                        console.log('[Shaka] 文本缓冲信息:', textBuffers);
                    }
                } else {
                    console.log('[Shaka] StreamingEngine 不可用');
                }
            } catch (e) {
                console.warn('[Shaka] StreamingEngine 检查失败:', e.message);
            }
            
            // ★ 检查 MediaSource 状态
            try {
                const mediaElement = videoEl;
                if (mediaElement) {
                    console.log('[Shaka] MediaSource:', mediaElement.mediaSource ? '可用' : '不可用');
                    
                    // 检查 sourceBuffer 数量
                    if (mediaElement.mediaSource?.sourceBuffers) {
                        console.log('[Shaka] SourceBuffers 数量:', mediaElement.mediaSource.sourceBuffers.length);
                        for (let i = 0; i < mediaElement.mediaSource.sourceBuffers.length; i++) {
                            const sb = mediaElement.mediaSource.sourceBuffers[i];
                            console.log(`[Shaka] SourceBuffer[${i}]: mimeType=${sb.mimeType}, updating=${sb.updating}`);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Shaka] MediaSource 检查失败:', e.message);
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
