/**
 * shaka-init.js - Shaka Player 初始化
 */

import { state } from './state.js';
import { SHAKA_RETRY } from './constants.js';
import { getHeaderCaseInsensitive } from './utils.js';
import { formatPlaybackError } from './errors.js';
import { pushDiagnosticEvent } from './diagnostics.js';
import { toSameOriginM3UProxyUrl } from './proxy.js';

// ========== ISO 639-3 → 639-1 语言映射 ==========
// 许多 IPTV 源使用 ISO 639-3 代码（如 cmn=普通话），但浏览器/Shaka 不识别
const EXTRA_LANGUAGE_MAPPINGS = {
    // 中文变体
    'cmn': 'zh',    // Mandarin Chinese
    'zho': 'zh',    // Chinese (ISO 639-2)
    'chi': 'zh',    // Chinese (ISO 639-2 bibliographic)
    'yue': 'zh',    // Cantonese
    'wuu': 'zh',    // Wu Chineseå
    'hak': 'zh',    // Hakka Chinese
    'nan': 'zh',    // Min Nan Chinese
    // 其他常见 ISO 639-2 B → 639-1
    'cze': 'cs',    // Czech
    'wel': 'cy',    // Welsh
    'ger': 'de',    // German
    'gre': 'el',    // Greek
    'per': 'fa',    // Persian
    'fre': 'fr',    // French
    'arm': 'hy',    // Armenian
    'ice': 'is',    // Icelandic
    'geo': 'ka',    // Georgian
    'mac': 'mk',    // Macedonian
    'mao': 'mi',    // Maori
    'may': 'ms',    // Malay
    'bur': 'my',    // Burmese
    'dut': 'nl',    // Dutch
    'rum': 'ro',    // Romanian
    'slo': 'sk',    // Slovak
    'alb': 'sq',    // Albanian
    'srp': 'sr',    // Serbian
    'hrv': 'hr',    // Croatian
    'bos': 'bs',    // Bosnian
    'tib': 'bo',    // Tibetan
};

// ========== 判断是否为中文语言代码 ==========
function isChineseLang(lang) {
    if (!lang) return false;
    const l = lang.toLowerCase();
    return l.startsWith('zh') || l === 'cmn' || l === 'zho' || l === 'chi' ||
           l === 'yue' || l === 'wuu' || l === 'hak' || l === 'nan';
}

// ========== 注入 ISO 639-3 语言映射 ==========
// Shaka v5 内部用 Fc（Map）做 ISO 639-2/B → 639-1 映射
// LanguageUtils.ISOMAP_ 在 v5 中不存在，需要通过 normalize 间接验证
function installLanguageMappings() {
    try {
        // 方法1：尝试直接访问 ISOMAP_（v4 兼容）
        const isoMap = shaka.util.LanguageUtils?.ISOMAP_;
        if (isoMap && typeof isoMap.set === 'function') {
            let added = 0;
            for (const [from, to] of Object.entries(EXTRA_LANGUAGE_MAPPINGS)) {
                if (!isoMap.has(from)) {
                    isoMap.set(from, to);
                    added++;
                }
            }
            console.log(`[Shaka] 已注入 ${added} 条 ISO 639-3 语言映射 (ISOMAP_), size: ${isoMap.size}`);
            return;
        }

        // 方法2：Shaka v5 — 通过 monkey-patch LanguageUtils.normalize 注入映射
        const origNormalize = shaka.util.LanguageUtils.normalize;
        if (typeof origNormalize === 'function') {
            shaka.util.LanguageUtils.normalize = function(lang) {
                // 先查我们的映射表
                const lower = (lang || '').split('-')[0].split('_')[0].toLowerCase();
                if (EXTRA_LANGUAGE_MAPPINGS[lower]) {
                    const mapped = EXTRA_LANGUAGE_MAPPINGS[lower];
                    // 替换基础语言代码部分，保留区域后缀
                    const rest = lang.substring(lower.length);
                    lang = mapped + rest;
                }
                return origNormalize.call(this, lang);
            };
            // 验证
            const testResult = shaka.util.LanguageUtils.normalize('cmn');
            console.log(`[Shaka] 已通过 monkey-patch 注入语言映射, cmn→${testResult}`);
        } else {
            console.warn('[Shaka] 无法注入语言映射：normalize 方法不可用');
        }
    } catch (e) {
        console.warn('[Shaka] 注入语言映射失败:', e.message || e);
    }
}

// ========== 自动选择中文音轨和字幕 ==========
function autoSelectChineseTracks() {
    if (!state.player) return;
    try {
        const variantTracks = state.player.getVariantTracks();
        const textTracks = state.player.getTextTracks();

        // 自动选择中文音轨
        if (variantTracks && variantTracks.length > 0) {
            const currentVariant = variantTracks.find(t => t.active);
            if (currentVariant && !isChineseLang(currentVariant.language)) {
                const zhTrack = variantTracks.find(t => isChineseLang(t.language) && t.type === 'variant');
                if (zhTrack) {
                    // 临时禁用 ABR，避免 selectVariantTrack 被覆盖
                    const wasAbrEnabled = state.player.getConfiguration().abr.enabled;
                    if (wasAbrEnabled) state.player.configure({ abr: { enabled: false } });
                    state.player.selectVariantTrack(zhTrack);
                    if (wasAbrEnabled) state.player.configure({ abr: { enabled: true } });
                    console.log('[Shaka] 自动选择中文音轨:', zhTrack.language);
                }
            }
        }

        // 自动选择中文字幕（v5 中 selectTextTrack 会自动启用字幕可见性）
        if (textTracks && textTracks.length > 0) {
            const activeText = textTracks.find(t => t.active);
            if (!activeText || !isChineseLang(activeText.language)) {
                const zhText = textTracks.find(t => isChineseLang(t.language));
                if (zhText) {
                    state.player.selectTextTrack(zhText);
                    console.log('[Shaka] 自动选择中文字幕:', zhText.language);
                }
            }
        }
    } catch (e) {
        console.warn('[Shaka] 自动选择中文轨道失败:', e.message || e);
    }
}

export async function initShakaPlayer(elements) {
    const startTime = performance.now();
    
    if (!window.shaka) {
        console.warn('[shaka-init] window.shaka 未加载');
        if (elements.statusText) elements.statusText.textContent = '播放器库加载失败';
        return false;
    }

    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) { if (elements.statusText) elements.statusText.textContent = '浏览器不支持 Shaka'; return false; }

    // 注入 ISO 639-3 语言映射（必须在 Player 创建之前）
    installLanguageMappings();

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

    // 先创建 Player
    state.player = new shaka.Player();

    // attach 到 video
    await state.player.attach(videoEl);

    // 创建 Overlay（UI）
    if (containerEl && shaka.ui && shaka.ui.Overlay) {
        state.overlay = new shaka.ui.Overlay(state.player, containerEl, videoEl);
    }

    // 配置 textDisplayFactory：确保字幕能正确渲染
    // Shaka v5 的 textDisplayFactory 参数不是 mediaElement，而是 Player 内部对象
    // UITextDisplayer 内部调用 a.Jb() 获取 video 元素，a.fd() 获取容器 DOM 元素
    // 但 Player.fd() 返回 EventManager 而非 DOM 元素，导致 ResizeObserver 崩溃
    // 解决方案：创建代理对象，确保 fd() 返回正确的 DOM 容器元素
    try {
        const videoElement = videoEl;
        const containerElement = containerEl;
        if (shaka.text && shaka.text.UITextDisplayer && containerElement) {
            state.player.configure({
                textDisplayFactory: (playerObj) => {
                    // 创建代理：让 UITextDisplayer 的 fd() 返回正确的 DOM 容器
                    const proxy = {
                        Jb: () => videoElement,      // 返回 video 元素
                        fd: () => containerElement,   // 返回容器 DOM 元素（而非 Player 的 EventManager）
                    };
                    // 同时代理 playerObj 上的其他可能方法调用
                    const handler = {
                        get(target, prop) {
                            if (prop in proxy) return proxy[prop];
                            const val = target[prop];
                            return typeof val === 'function' ? val.bind(target) : val;
                        }
                    };
                    return new shaka.text.UITextDisplayer(new Proxy(playerObj, handler));
                }
            });
            console.log('[Shaka] textDisplayFactory 已设置为 UITextDisplayer（代理模式）');
        } else if (shaka.text && shaka.text.NativeTextDisplayer) {
            // 回退：使用 NativeTextDisplayer（通过 <track> 元素渲染）
            state.player.configure({
                textDisplayFactory: (playerObj) => new shaka.text.NativeTextDisplayer(playerObj)
            });
            console.log('[Shaka] textDisplayFactory 已设置为 NativeTextDisplayer');
        } else {
            console.warn('[Shaka] 无可用的 TextDisplayer 类');
        }
    } catch (e) {
        console.warn('[Shaka] 设置 textDisplayFactory 失败:', e.message || e);
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
            },
            // 语言与字幕偏好
            preferredAudioLanguage: 'zh',
            preferredTextLanguage: 'zh',
            preferForcedSubs: false,
        });
    } catch (e) {
        console.warn('[shaka-init] 播放器配置出错（非致命）:', e.message || e);
    }

    const networkingEngine = state.player.getNetworkingEngine();
    if (networkingEngine) {
        networkingEngine.registerRequestFilter((type, request) => {
            // 尝试获取认证 token（优先 localStorage，备用 cookie）
            let token = localStorage.getItem('authToken');
            if (!token) {
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'authToken' && value) { token = value; break; }
                }
            }
            
            if (Array.isArray(request?.uris) && request.uris.length > 0) {
                request.uris = request.uris.map(uri => rewriteShakaProxyRelativeUri(uri));
                const isProxyRequest = request.uris.some(uri => String(uri).includes('/m3u-proxy?url='));
                if (isProxyRequest) {
                    request.headers = request.headers || {};
                    if (token) {
                        request.headers['Authorization'] = `Bearer ${token}`;
                        console.log('[Shaka] 为代理请求添加认证 token');
                    } else {
                        console.warn('[Shaka] 警告：代理请求无认证 token，可能导致 403');
                    }
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
                for (let i = 0; i < textTracks.length; i++) {
                    const track = textTracks[i];
                    console.log(`[Shaka] 字幕轨道[${i}]: type=${track.type}, mimeType=${track.mimeType}, language=${track.language}, kind=${track.kind}`);
                }
            }
            
            // 自动选择中文音轨和字幕
            autoSelectChineseTracks();

            // 如果没有中文字幕，但有任意字幕，自动启用第一条
            if (textTracks && textTracks.length > 0) {
                const zhText = textTracks.find(t => isChineseLang(t.language));
                if (!zhText) {
                    // 无中文字幕时，启用第一条可用字幕（v5 中 selectTextTrack 自动启用可见性）
                    state.player.selectTextTrack(textTracks[0]);
                    console.log(`[Shaka] 无中文字幕，已启用: ${textTracks[0].language || textTracks[0].label || 'unknown'}`);
                }
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
            console.log(`[Shaka] 轨道[${i}]: type=${track.type}, mimeType=${track.mimeType}`);
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
        // 如果已经是 BirdTV Worker URL，直接返回，不再次包装
        // Worker URL 应该直接访问，不走 m3u-proxy
        try {
            const testParsed = new URL(raw);
            const hostname = String(testParsed.hostname || '').toLowerCase();
            if (hostname.includes('birdtv-proxy') && hostname.includes('.workers.dev')) {
                console.log('[Shaka] Segment URL 是 Worker URL，直接访问不代理:', hostname);
                return raw;
            }
        } catch {}

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

        // 再次检查转换后的 URL 是否是 Worker URL
        try {
            const finalParsed = new URL(absoluteTarget);
            const finalHostname = String(finalParsed.hostname || '').toLowerCase();
            if (finalHostname.includes('birdtv-proxy') && finalHostname.includes('.workers.dev')) {
                console.log('[Shaka] 转换后是 Worker URL，直接访问不代理:', finalHostname);
                return absoluteTarget;
            }
        } catch {}

        // 关键修复：segment URL（cmfa, cmfv, cmft, stpp 等）不代理
        // 只有 manifest 需要通过 Worker 代理解决 WAF，segment 直接访问 CDN
        const segmentPatterns = /\.(cmfa|cmfv|cmft|stpp|_stpp\.)/i;
        if (segmentPatterns.test(absoluteTarget)) {
            // HTTP→HTTPS 升级：避免 Mixed Content 阻断
            const upgraded = absoluteTarget.replace(/^http:/i, 'https:');
            console.log('[Shaka] Segment URL 不代理，直接访问:', upgraded.substring(0, 100) + '...');
            return upgraded;
        }

        return toSameOriginM3UProxyUrl(absoluteTarget) || absoluteTarget;
    } catch { return raw; }
}
