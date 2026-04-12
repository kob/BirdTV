/**
 * live.js - 主播放界面 / 播放核心引擎
 * 负责播放调度、引擎决策分发、并发控制
 */

import { state } from './state.js';
import {
    UHD_HINT_PATTERN, PLAY_REQUEST_DEDUP_MS,
    SHAKA_LOAD_TIMEOUT_MS, SHAKA_PROXY_LOAD_TIMEOUT_MS
} from './constants.js';
import {
    shouldUseProxy, getProxyUrl, unwrapProxySourceUrl,
    isCorsRestricted, isLikelyDashUrl, isLikelyHlsStreamUrl,
    getTempProxyMode, shouldPreferProxyFirst
} from './proxy.js';
import {
    applyShakaDrmConfigForSource, assertDrmConfigBeforeShaka,
    hasDrmInfo, isLikelyHevcSource, deriveDrmProfile
} from './drm.js';
import { pushDiagnosticEvent, toDiagnosticErrorCode, toDiagnosticErrorMessage, getCurrentPlaybackSnapshot } from './diagnostics.js';
import { formatPlaybackError, explainPlaybackError } from './errors.js';
import { getEffectiveUserAgent } from './ua.js';
import { updateFallbackCooldownText } from './players/fallback.js';
import { initShakaPlayer } from './shaka-init.js';

// ─── 辅助函数 ───

function createCancelledPlayError() {
    const error = new Error('播放请求已取消');
    error.isCancelled = true;
    return error;
}

function isBenignPlayInterruptedError(error) {
    const name = String(error?.name || '');
    const message = String(error?.message || '');
    return name === 'AbortError' || /play\(\) request was interrupted by a new load request/i.test(message);
}

function assertActivePlayRequest(requestId) {
    if (requestId !== state.playRequestSeq) throw createCancelledPlayError();
}

// ─── Shaka 管道控制 ───

export async function ensureShakaAttached() {
    if (state._pendingCleanupDetach) {
        await state._pendingCleanupDetach;
        state._pendingCleanupDetach = null;
    }
    if (!state.player) {
        const videoEl = document.getElementById("video");
        if (!videoEl || !window.shaka) return false;
        const statusText = document.getElementById("status-text");
        const ok = await initShakaPlayer({ video: videoEl, video: videoEl, statusText });
        if (!ok) { console.warn('[ensureShakaAttached] Shaka 重新初始化失败'); return false; }
    }
    const videoEl = document.getElementById("video");
    if (!videoEl) return false;
    if (state.player.getMediaElement() === videoEl) return true;
    if (videoEl.src) { videoEl.src = ''; videoEl.load(); }
    await state.player.attach(videoEl);
    return true;
}

export async function ensureShakaDetached() {
    if (!state.player) return;
    try { await state.player.unload(); } catch (e) { console.warn('Shaka unload (detach prep):', e); }
    try { await state.player.detach(); } catch (e) { console.warn('Shaka detach:', e); }
}

async function resetShakaPipelineForRetry() {
    if (!state.player) return;
    const videoEl = document.getElementById("video");
    try { await state.player.unload(); } catch (e) { console.warn('Shaka unload:', e); }
    try { await state.player.detach(); } catch (e) { console.warn('Shaka detach:', e); }
    if (videoEl) { videoEl.removeAttribute('src'); videoEl.load(); }
    await state.player.attach(videoEl);
}

function isShakaMediaSourceClosedError(error) { return Number(error?.code) === 3015; }
function isShakaDrmInitOrLicenseError(error) { const code = Number(error?.code); return code === 6001 || code === 6012; }
function isLikelyTransientShakaError(error) {
    if (!error) return false;
    if (error.isTimeout) return true;
    const code = Number(error.code);
    if (code === 1001 || code === 1002 || code === 3015) return true;
    const raw = String(error.message || '').toLowerCase();
    return raw.includes('timeout') || raw.includes('network') || raw.includes('econn') || raw.includes('aborted');
}
function isShakaNetworkFetchError(error) {
    if (!error) return false;
    return Number(error.code) === 7002 || Number(error.category) === 7;
}

async function loadShakaWithTimeout(url, labelPrefix, requestId, timeoutMs = SHAKA_LOAD_TIMEOUT_MS, upstreamHintForProxy = '') {
    assertActivePlayRequest(requestId);
    setShakaProxyRewriteContext(url, upstreamHintForProxy);
    let timer = null;
    try {
        const loadPromise = state.player.load(url);
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const timeoutError = new Error(`${labelPrefix}加载超时（>${Math.floor(timeoutMs / 1000)}s）`);
                timeoutError.isTimeout = true;
                reject(timeoutError);
            }, timeoutMs);
        });
        await Promise.race([loadPromise, timeoutPromise]);
        assertActivePlayRequest(requestId);
        if (url.includes('/m3u-proxy?url=')) { import('./proxy.js').then(m => m.markProxyHealthy()); }
    } catch (error) {
        if (url.includes('/m3u-proxy?url=') && !isShakaDrmInitOrLicenseError(error)) {
            import('./proxy.js').then(m => m.markProxyUnhealthy(error?.message || 'proxy load failed'));
        }
        throw error;
    } finally { if (timer) clearTimeout(timer); }
}

function setShakaProxyRewriteContext(loadUrl, upstreamHint = '') {
    const rawLoadUrl = String(loadUrl || '').trim();
    const lowerLoadUrl = rawLoadUrl.toLowerCase();
    const isProxyLoad = lowerLoadUrl.includes('/m3u-proxy?url=');
    const upstream = String(upstreamHint || unwrapProxySourceUrl(rawLoadUrl) || '').trim();

    if (!isProxyLoad || !upstream) {
        state.shakaProxyRewriteContext = { enabled: false, upstreamOrigin: '', upstreamManifestUrl: '', userAgent: '' };
        return;
    }

    try {
        const parsed = new URL(upstream, window.location.href);
        state.shakaProxyRewriteContext = {
            enabled: true,
            upstreamOrigin: parsed.origin,
            upstreamManifestUrl: parsed.toString(),
            userAgent: ''
        };
    } catch {
        state.shakaProxyRewriteContext = { enabled: false, upstreamOrigin: '', upstreamManifestUrl: '', userAgent: '' };
    }
}

export async function loadShakaWithSmartFallback(source, actualUrl, labelPrefix, requestId) {
    if (!state.player) throw new Error('Shaka Player 尚未初始化');

    const checkInterrupted = () => {
        if (state.globalAbortController?.signal.aborted) throw new Error('播放请求被中断');
    };

    checkInterrupted();
    assertActivePlayRequest(requestId);
    const unwrappedUrl = unwrapProxySourceUrl(actualUrl) || actualUrl;
    const wrappedProxyInput = (await import('./proxy.js')).isWrappedM3UProxyUrl(actualUrl);
    const manualLineLocked = !!(source?.manualLineLocked);
    const directUrl = wrappedProxyInput ? unwrappedUrl : actualUrl;
    let dashDirectUrl = directUrl;
    const currentProxyMode = getTempProxyMode();
    const isDash = isLikelyDashUrl(directUrl);
    const { getProxyUrl: gPU, checkProxyHealth } = await import('./proxy.js');
    let shakaUpstreamHint = directUrl;
    let shouldForceDashProxyByRedirect = false;

    if (isDash) {
        try {
            if (state.globalAbortController?.signal.aborted) throw new Error('检测被中断');
            const { detectAndHandleRedirect } = await import('./redirect.js');
            const redirectInfo = await detectAndHandleRedirect(directUrl, { timeout: 4000, maxRedirects: 3, followRedirects: true, skipIfInterrupted: true });
            if (redirectInfo?.finalUrl) {
                shakaUpstreamHint = redirectInfo.finalUrl;
                if (redirectInfo.redirected) console.log(`${labelPrefix}检测到DASH重定向最终地址:`, redirectInfo.finalUrl);
                pushDiagnosticEvent(null, {
                    type: 'dash-redirect-check',
                    level: redirectInfo.redirected ? 'warn' : 'info',
                    player: 'shaka',
                    channel: source?.name || '',
                    url: directUrl,
                    message: redirectInfo.redirected
                        ? `DASH重定向: ${directUrl} -> ${redirectInfo.finalUrl}`
                        : `DASH未发生重定向: ${directUrl}`,
                    meta: {
                        requestUrl: directUrl,
                        finalUrl: redirectInfo.finalUrl || directUrl,
                        redirected: !!redirectInfo.redirected,
                        status: Number(redirectInfo.status || 0),
                        tempProxyMode: currentProxyMode
                    }
                });
                try {
                    const fromHost = new URL(directUrl, window.location.href).host;
                    const toHost = new URL(redirectInfo.finalUrl, window.location.href).host;
                    if (redirectInfo.redirected && fromHost !== toHost && currentProxyMode === 'auto') {
                        console.log(`${labelPrefix}DASH 发生跨主机重定向，保持直连优先: ${fromHost} -> ${toHost}`);
                        pushDiagnosticEvent(null, {
                            type: 'dash-proxy-decision',
                            level: 'info',
                            player: 'shaka',
                            channel: source?.name || '',
                            url: directUrl,
                            message: `DASH跨主机重定向，保持直连优先: ${fromHost} -> ${toHost}`
                        });
                    }
                } catch {
                    // ignore host compare failures
                }

                if (
                    currentProxyMode === 'auto' &&
                    window.location.protocol === 'https:' &&
                    directUrl.startsWith('http://') &&
                    /^https:\/\//i.test(String(redirectInfo.finalUrl || '').trim())
                ) {
                    dashDirectUrl = String(redirectInfo.finalUrl).trim();
                    shakaUpstreamHint = dashDirectUrl;
                    pushDiagnosticEvent(null, {
                        type: 'dash-proxy-decision',
                        level: 'info',
                        player: 'shaka',
                        channel: source?.name || '',
                        url: directUrl,
                        message: `DASH 通过代理探测切换为 HTTPS 直连: ${dashDirectUrl}`
                    });
                }
            }
        } catch (redirectError) {
            if (redirectError.message === '检测被中断') throw redirectError;
            console.warn(`${labelPrefix}解析DASH重定向最终地址失败:`, redirectError?.message || redirectError);
        }
    }

    const playbackDirectUrl = isDash ? dashDirectUrl : directUrl;
    const corsRestricted = isCorsRestricted(playbackDirectUrl);
    const useProxyMode = shouldUseProxy(playbackDirectUrl, false, source);
    const proxyUrl = gPU(playbackDirectUrl, getEffectiveUserAgent(source));
    const preserveInputProxyUrl = wrappedProxyInput && currentProxyMode === 'm3u-proxy';
    const proxyPlaybackUrl = preserveInputProxyUrl ? actualUrl : proxyUrl;

    const directTimeoutMs = SHAKA_LOAD_TIMEOUT_MS;

    const dashProxyCapableMode = currentProxyMode === 'm3u-proxy' || wrappedProxyInput;
    const shouldStartDashViaProxy = currentProxyMode === 'm3u-proxy' || shouldForceDashProxyByRedirect || (
        currentProxyMode === 'auto' &&
        window.location.protocol === 'https:' &&
        playbackDirectUrl.startsWith('http://')
    );

    pushDiagnosticEvent(null, {
        type: 'shaka-load-plan',
        level: 'info',
        player: 'shaka',
        channel: source?.name || '',
        url: shouldStartDashViaProxy ? proxyPlaybackUrl : playbackDirectUrl,
        message: shouldStartDashViaProxy ? 'Shaka 将通过代理加载' : 'Shaka 将直接加载',
        meta: {
            actualInputUrl: actualUrl,
            directUrl,
            playbackDirectUrl,
            proxyPlaybackUrl,
            wrappedProxyInput,
            isDash,
            tempProxyMode: currentProxyMode,
            shouldStartDashViaProxy,
            shouldForceDashProxyByRedirect,
            shakaUpstreamHint
        }
    });

    // HTTPS 页面 + HTTP 源的 mixed content 处理已移至 DASH 加载阶段的 HTTPS 升级直连回退逻辑

    try {
        if (isDash) {
            const isDirectMode = currentProxyMode === 'direct';

            // HTTPS 页面 + HTTP 源：先尝试升级为 HTTPS 直连，失败再走代理
            let httpsUpgradeUrl = null;
            const isHttpsPage = window.location.protocol === 'https:';
            const isHttpSource = playbackDirectUrl.startsWith('http://');

            if (isDirectMode && isHttpsPage && isHttpSource) {
                // direct 模式下也优先尝试 HTTPS 升级直连
                httpsUpgradeUrl = playbackDirectUrl.replace(/^http:\/\//i, 'https://');
                console.log(`${labelPrefix}direct 模式 HTTPS 页面检测到 HTTP 源，先尝试 HTTPS 升级直连: ${httpsUpgradeUrl}`);
                pushDiagnosticEvent(null, {
                    type: 'dash-https-upgrade',
                    level: 'info',
                    player: 'shaka',
                    channel: source?.name || '',
                    url: playbackDirectUrl,
                    message: `direct 模式 HTTPS 页面 HTTP 源，尝试 HTTPS 升级: ${httpsUpgradeUrl}`
                });
                try {
                    await loadShakaWithTimeout(httpsUpgradeUrl, `${labelPrefix}DASH HTTPS 升级直连`, requestId, directTimeoutMs);
                    return;
                } catch (httpsUpgradeError) {
                    console.warn(`${labelPrefix}direct 模式 HTTPS 升级直连失败 (code: ${httpsUpgradeError.code || '-'}): ${httpsUpgradeError.message}，回退到代理模式`);
                    pushDiagnosticEvent(null, {
                        type: 'dash-https-upgrade-fail',
                        level: 'warn',
                        player: 'shaka',
                        channel: source?.name || '',
                        url: httpsUpgradeUrl,
                        code: toDiagnosticErrorCode(httpsUpgradeError),
                        message: `direct 模式 HTTPS 升级失败，回退代理: ${httpsUpgradeError.message || httpsUpgradeError}`
                    });
                    await resetShakaPipelineForRetry();
                    assertActivePlayRequest(requestId);
                    applyShakaDrmConfigForSource(source);
                    await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}DASH 代理(direct升级失败后)`, requestId, directTimeoutMs, shakaUpstreamHint);
                    return;
                }
            } else if (isDirectMode) {
                await loadShakaWithTimeout(playbackDirectUrl, `${labelPrefix}DASH 直连`, requestId, directTimeoutMs);
            } else if (isHttpsPage && isHttpSource && !dashProxyCapableMode && currentProxyMode === 'auto') {
                // 先尝试将 http:// 升级为 https:// 直连
                httpsUpgradeUrl = playbackDirectUrl.replace(/^http:\/\//i, 'https://');
                console.log(`${labelPrefix}HTTPS 页面检测到 HTTP 源，先尝试 HTTPS 升级直连: ${httpsUpgradeUrl}`);
                pushDiagnosticEvent(null, {
                    type: 'dash-https-upgrade',
                    level: 'info',
                    player: 'shaka',
                    channel: source?.name || '',
                    url: playbackDirectUrl,
                    message: `HTTPS 页面 HTTP 源，尝试 HTTPS 升级: ${httpsUpgradeUrl}`
                });
                try {
                    await loadShakaWithTimeout(httpsUpgradeUrl, `${labelPrefix}DASH HTTPS 升级直连`, requestId, directTimeoutMs);
                    return;
                } catch (httpsUpgradeError) {
                    console.warn(`${labelPrefix}HTTPS 升级直连失败 (code: ${httpsUpgradeError.code || '-'}): ${httpsUpgradeError.message}，回退到代理模式`);
                    pushDiagnosticEvent(null, {
                        type: 'dash-https-upgrade-fail',
                        level: 'warn',
                        player: 'shaka',
                        channel: source?.name || '',
                        url: httpsUpgradeUrl,
                        code: toDiagnosticErrorCode(httpsUpgradeError),
                        message: `HTTPS 升级失败，回退代理: ${httpsUpgradeError.message || httpsUpgradeError}`
                    });
                    // 升级失败，走代理
                    await resetShakaPipelineForRetry();
                    assertActivePlayRequest(requestId);
                    applyShakaDrmConfigForSource(source);
                    const dashTimeoutMs = shouldForceDashProxyByRedirect
                        ? Math.max(SHAKA_PROXY_LOAD_TIMEOUT_MS, 12000)
                        : directTimeoutMs;
                    await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}DASH 代理(HTTPS升级失败后)`, requestId, dashTimeoutMs, shakaUpstreamHint);
                    return;
                }
            } else if (shouldStartDashViaProxy) {
                // HTTPS 页面 + HTTP 源：先尝试升级为 HTTPS 直连，失败再走代理
                if (isHttpsPage && isHttpSource && !shouldForceDashProxyByRedirect) {
                    httpsUpgradeUrl = playbackDirectUrl.replace(/^http:\/\//i, 'https://');
                    console.log(`${labelPrefix}代理模式下 HTTPS 页面检测到 HTTP 源，先尝试 HTTPS 升级直连: ${httpsUpgradeUrl}`);
                    pushDiagnosticEvent(null, {
                        type: 'dash-https-upgrade',
                        level: 'info',
                        player: 'shaka',
                        channel: source?.name || '',
                        url: playbackDirectUrl,
                        message: `代理模式 HTTPS 页面 HTTP 源，尝试 HTTPS 升级: ${httpsUpgradeUrl}`
                    });
                    try {
                        await loadShakaWithTimeout(httpsUpgradeUrl, `${labelPrefix}DASH HTTPS 升级直连`, requestId, directTimeoutMs);
                        return;
                    } catch (httpsUpgradeError) {
                        console.warn(`${labelPrefix}HTTPS 升级直连失败 (code: ${httpsUpgradeError.code || '-'}): ${httpsUpgradeError.message}，回退到代理模式`);
                        pushDiagnosticEvent(null, {
                            type: 'dash-https-upgrade-fail',
                            level: 'warn',
                            player: 'shaka',
                            channel: source?.name || '',
                            url: httpsUpgradeUrl,
                            code: toDiagnosticErrorCode(httpsUpgradeError),
                            message: `HTTPS 升级失败，回退代理: ${httpsUpgradeError.message || httpsUpgradeError}`
                        });
                        await resetShakaPipelineForRetry();
                        assertActivePlayRequest(requestId);
                        applyShakaDrmConfigForSource(source);
                    }
                }
                const dashLoadLabel = currentProxyMode === 'm3u-proxy'
                    ? `${labelPrefix}DASH 代理`
                    : `${labelPrefix}DASH 代理`;
                const dashTimeoutMs = shouldForceDashProxyByRedirect
                    ? Math.max(SHAKA_PROXY_LOAD_TIMEOUT_MS, 12000)
                    : directTimeoutMs;
                await loadShakaWithTimeout(proxyPlaybackUrl, dashLoadLabel, requestId, dashTimeoutMs, shakaUpstreamHint);
            } else {
                await loadShakaWithTimeout(playbackDirectUrl, `${labelPrefix}DASH 直连`, requestId, directTimeoutMs);
            }
        } else {
            const isDirectMode = currentProxyMode === 'direct';
            if (isDirectMode) {
                await loadShakaWithTimeout(playbackDirectUrl, `${labelPrefix}直连`, requestId, directTimeoutMs);
            } else {
                await loadShakaWithTimeout(proxyUrl, `${labelPrefix}代理`, requestId, directTimeoutMs);
            }
        }
    } catch (directError) {
        if (isShakaMediaSourceClosedError(directError)) {
            console.warn(`${labelPrefix}检测到 Shaka 3015，重置后重试代理一次。`);
            await resetShakaPipelineForRetry();
            assertActivePlayRequest(requestId);
            applyShakaDrmConfigForSource(source);
            await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}代理重试`, requestId);
            return;
        }

        const isDirectMode = getTempProxyMode() === 'direct';
        if (isDirectMode) throw directError;

        if (manualLineLocked) {
            if (useProxyMode && corsRestricted && proxyPlaybackUrl && proxyPlaybackUrl !== playbackDirectUrl) {
                await resetShakaPipelineForRetry();
                assertActivePlayRequest(requestId);
                applyShakaDrmConfigForSource(source);
                await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}手动锁线同线路代理`, requestId, Math.max(SHAKA_PROXY_LOAD_TIMEOUT_MS, 12000), shakaUpstreamHint);
                return;
            }
            throw directError;
        }

        if (isDash && wrappedProxyInput && isShakaNetworkFetchError(directError)) {
            await resetShakaPipelineForRetry();
            assertActivePlayRequest(requestId);
            applyShakaDrmConfigForSource(source);
            await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}DASH 代理兜底`, requestId, Math.max(SHAKA_PROXY_LOAD_TIMEOUT_MS, 12000), shakaUpstreamHint);
            return;
        }

        // auto/direct 模式下，DASH 失败不自动切到代理，保持直连语义。
        if (isDash && !dashProxyCapableMode && !shouldForceDashProxyByRedirect) {
            throw directError;
        }

        const proxyHealthy = await checkProxyHealth(false);
        assertActivePlayRequest(requestId);
        const proxyTimeoutMs = proxyHealthy ? SHAKA_PROXY_LOAD_TIMEOUT_MS : Math.min(SHAKA_PROXY_LOAD_TIMEOUT_MS, 5000);

        assertActivePlayRequest(requestId);
        await resetShakaPipelineForRetry();
        assertActivePlayRequest(requestId);
        applyShakaDrmConfigForSource(source);
        try {
            await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}代理`, requestId, proxyTimeoutMs, shakaUpstreamHint);
        } catch (proxyError) {
            if (isLikelyTransientShakaError(proxyError)) {
                await resetShakaPipelineForRetry();
                assertActivePlayRequest(requestId);
                applyShakaDrmConfigForSource(source);
                await loadShakaWithTimeout(proxyPlaybackUrl, `${labelPrefix}代理二次重试`, requestId, Math.max(SHAKA_PROXY_LOAD_TIMEOUT_MS, 18000), shakaUpstreamHint);
                return;
            }
            if (!proxyHealthy) throw directError;
            throw proxyError;
        }
    }
}

// ─── 播放器清理 ───

export async function cleanupCurrentPlayer() {
    // 先暂停 video（防止继续播放）
    const videoEl = document.getElementById("video");
    if (videoEl) {
        try { videoEl.pause(); } catch(e) { /* ignore */ }
    }

    // 清理 ArtPlayer
    if (state.artPlayer) { try { state.artPlayer.destroy(true); } catch (e) { /* ignore */ } state.artPlayer = null; }
    // 清理 HLS.js
    if (state.hlsPlayer) { try { state.hlsPlayer.destroy(); } catch (e) { /* ignore */ } state.hlsPlayer = null; }
    // 清理 MPEGTS
    if (state.mpegtsPlayer) {
        try { state.mpegtsPlayer.pause(); state.mpegtsPlayer.unload(); state.mpegtsPlayer.detachMediaElement(); state.mpegtsPlayer.destroy(); } catch (e) { /* ignore */ }
        state.mpegtsPlayer = null;
    }
    // 清理 Shaka Player - 完整卸载
    if (state.player) {
        try { await state.player.unload(); } catch (e) { /* ignore */ }
        try { await state.player.detach(); } catch (e) { /* ignore */ }
        state.player = null;
    }

    // 清理 video 元素
    if (videoEl) {
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.style.display = '';
    }

    // 隐藏并清空 ArtPlayer 容器
    const artCon = document.getElementById('artplayer-container');
    if (artCon) { artCon.style.display = 'none'; artCon.innerHTML = ''; }

    // 重置状态
    state.currentPlayerType = null;
}

async function interruptCurrentPlayForSwitch() {
    if (state.globalAbortController) { state.globalAbortController.abort(); state.globalAbortController = null; }
    const cleanupPromise = new Promise(resolve => {
        try {
            if (state.player) {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('unload timeout')), 1000));
                Promise.race([state.player.unload(), timeoutPromise]).then(resolve).catch(error => { console.warn('切台中断:', error); resolve(); });
            } else { resolve(); }
        } catch (error) { console.warn('切台中断:', error); resolve(); }
    });
    await cleanupCurrentPlayer();
    state.isLoadingSource = false;
    await Promise.race([cleanupPromise, new Promise(resolve => setTimeout(resolve, 1500))]);
}

// ─── 引擎决策 ───

function getPlaybackEngineDecision(source) {
    const fallback = { engine: 'hls', playerType: 'hls', reason: 'default_hls', sourceKind: 'unknown', strategy: 'compat', drmProfile: deriveDrmProfile(source) };

    if (!source || typeof source !== 'object') return fallback;

    // 调试：输出决策信息
    console.log('[EngineDecision] 频道:', source.name);
    console.log('[EngineDecision] 输入配置:', {
        playerType: source.playerType,
        streamType: source.streamType,
        sourceDefaultPlayerType: source.sourceDefaultPlayerType,
        sourceProxyMode: source.sourceProxyMode,
        url: source.url?.substring(0, 100)
    });

    // 优先使用源的默认播放器设置
    const sourceDefaultPlayerType = String(source.sourceDefaultPlayerType || '').trim().toLowerCase();
    const sourceProxyMode = String(source.sourceProxyMode || '').trim().toLowerCase();

    // 如果频道没有手动设置播放器，且源有默认播放器设置，则使用源的默认设置
    const manualRaw = String(source.playerType || '').trim().toLowerCase();
    let effectivePlayerType = manualRaw;

    if (!manualRaw || manualRaw === 'auto') {
        if (sourceDefaultPlayerType && sourceDefaultPlayerType !== 'auto') {
            effectivePlayerType = sourceDefaultPlayerType;
        }
    }

    if (effectivePlayerType && effectivePlayerType !== 'auto') {
        // 将 artplayer/hlsjs 转换为 hls，使用 ArtPlayer 播放
        let manual = (effectivePlayerType === 'art' || effectivePlayerType === 'artplayer' || effectivePlayerType === 'hlsjs' || effectivePlayerType === 'hls.js') ? 'hls' : effectivePlayerType;
        // 兼容旧数据中的 vlc-proxy/vlc-direct，回退为 auto
        if (effectivePlayerType === 'vlc-direct' || effectivePlayerType === 'vlc-proxy' || effectivePlayerType === 'vlc') {
            manual = 'auto';
        }
        const reason = manualRaw ? 'manual_override' : 'source_default';
        console.log('[EngineDecision] 使用手动/源默认配置:', { engine: manual, playerType: manual, reason, originalType: effectivePlayerType });
        return { engine: manual, playerType: manual, reason: reason, sourceKind: 'manual', strategy: 'manual', drmProfile: deriveDrmProfile(source) };
    }

    const explicitStreamType = String(source.streamType || '').trim().toLowerCase();
    if (explicitStreamType === 'mpd') {
        console.log('[EngineDecision] 使用 streamType=mpd -> shaka');
        return { engine: 'shaka', playerType: 'shaka', reason: 'stream_type_mpd', sourceKind: 'dash', strategy: 'compat', drmProfile: deriveDrmProfile(source) };
    }
    if (explicitStreamType === 'ts') {
        console.log('[EngineDecision] 使用 streamType=ts -> mpegts');
        return { engine: 'mpegts', playerType: 'mpegts', reason: 'stream_type_ts', sourceKind: 'http-ts', strategy: 'compat', drmProfile: deriveDrmProfile(source) };
    }
    if (explicitStreamType === 'hls') {
        console.log('[EngineDecision] 使用 streamType=hls -> hls');
        return { engine: 'hls', playerType: 'hls', reason: 'stream_type_hls', sourceKind: 'hls', strategy: 'compat', drmProfile: deriveDrmProfile(source) };
    }

    const targetUrl = String(source.url || '');
    const detectedUrl = unwrapProxySourceUrl(targetUrl) || targetUrl;
    const lower = String(detectedUrl || '').toLowerCase();
    const isDash = isLikelyDashUrl(detectedUrl);
    const drmPresent = hasDrmInfo(source);
    const drmProfile = deriveDrmProfile(source);
    const likelyHevc = isLikelyHevcSource(source, detectedUrl);
    const likelyUhd = UHD_HINT_PATTERN.test(`${String(source.name || '')} ${detectedUrl}`);

    if (isDash && drmPresent) {
        console.log('[EngineDecision] 检测到 DASH+DRM -> shaka');
        return { engine: 'shaka', playerType: 'shaka', reason: 'dash_drm', sourceKind: 'dash-drm', strategy: 'compat', drmProfile };
    }
    if (isDash) {
        console.log('[EngineDecision] 检测到 DASH -> shaka');
        return { engine: 'shaka', playerType: 'shaka', reason: 'dash', sourceKind: 'dash', strategy: 'compat', drmProfile };
    }

    if (/\/rtp\/|\/udp\//.test(lower) || /239\.\d+\.\d+\.\d+[:/]/.test(lower)) {
        console.log('[EngineDecision] 检测到 UDPXY -> mpegts');
        return { engine: 'mpegts', playerType: 'mpegts', reason: 'udpxy', sourceKind: 'http-ts', strategy: 'compat', drmProfile };
    }

    const hlsLike = isLikelyHlsStreamUrl(lower);
    if (hlsLike) {
        console.log('[EngineDecision] 检测到 HLS -> hls');
        return { engine: 'hls', playerType: 'hls', reason: 'hls', sourceKind: likelyHevc ? 'hls-hevc' : 'hls', strategy: 'compat', drmProfile };
    }

    if (/\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|ts)/.test(lower)) {
        console.log('[EngineDecision] 检测到文件 -> native');
        return { engine: 'native', playerType: 'native', reason: 'file', sourceKind: 'file', strategy: 'compat', drmProfile };
    }

    if (/\/live\/|\/stream\/|live=true|type=live/.test(lower)) {
        console.log('[EngineDecision] 检测到直播流 -> hls');
        return { engine: 'hls', playerType: 'hls', reason: 'live', sourceKind: 'live', strategy: 'compat', drmProfile };
    }

    console.log('[EngineDecision] 使用默认 -> hls');
    return fallback;
}

function resolveEngineExecutionPlan(engineDecision) {
    const playerType = engineDecision?.playerType || engineDecision?.engine || 'hls';
    return { requestedEngine: engineDecision?.engine, requestedPlayerType: playerType, playerType, executionReason: 'direct_engine_execution' };
}

// ─── 状态更新 ───

function updateStatus(elements, message, badge, isError = false) {
    elements.statusText.textContent = message;
    elements.statusBadge.textContent = badge;
    const isPlaying = !isError && badge === "播放成功";
    elements.statusBadge.style.color = isError ? "#ff8090" : isPlaying ? "#22d399" : "";
    elements.statusBadge.style.background = isError ? "rgba(255, 92, 114, 0.12)" : isPlaying ? "rgba(34, 211, 153, 0.1)" : "rgba(255, 255, 255, 0.06)";
    elements.statusBadge.style.borderColor = isError ? "rgba(255, 92, 114, 0.3)" : isPlaying ? "rgba(34, 211, 153, 0.3)" : "rgba(255, 255, 255, 0.09)";
    elements.currentTitle.style.color = isError ? "#ff8090" : "#d8ecff";
}

function updateCurrentInfo(elements, source) {
    if (!source) {
        if (elements.currentTitle) elements.currentTitle.textContent = "未开始播放";
        if (elements.currentUrl) elements.currentUrl.textContent = "-";
        if (elements.currentDrm) elements.currentDrm.textContent = "未配置";
        updateOrchestrationText(elements, null);
        updateFallbackCooldownText(null);
        if (elements.epgNow) elements.epgNow.textContent = "当前：-";
        if (elements.epgNowDesc) elements.epgNowDesc.textContent = "简介：-";
        if (elements.playerTypeDesc) elements.playerTypeDesc.textContent = "DASH MPD · Clear Key DRM · Shaka Player";
        return;
    }

    if (elements.currentTitle) elements.currentTitle.textContent = source.name;

    const playerType = state.lastEngineDecision?.playerType || state.lastEngineDecision?.engine || 'auto';
    const isManual = source.playerType && source.playerType !== 'auto';

    let playerTypeText = '';
    switch (playerType) {
        case 'shaka': playerTypeText = '[MPD]'; break;
        case 'hls': playerTypeText = '[ART-HLS]'; break;
        case 'mpegts': playerTypeText = '[MPEGTS]'; break;
        case 'native': playerTypeText = '[VIDEO]'; break;
        default: playerTypeText = '[VIDEO]'; break;
    }

    if (isManual) playerTypeText += ' (手动)';

    let actualPlayUrl = source.url || '';
    // 直接使用 source.url（即 playSource 传给播放器的 actualUrl），
    // 不再独立调用 shouldUseProxy/getProxyUrl 重新计算，
    // 避免与播放器内部的实际代理决策不一致。
    if (source.redirectFinalUrl) actualPlayUrl = source.redirectFinalUrl;

    if (elements.currentUrl) elements.currentUrl.textContent = `${playerTypeText} ${actualPlayUrl}`;

    const hasClearKey = !!(source.drm && source.drm.clearKeys && Object.keys(source.drm.clearKeys).length > 0);
    const hasLicense = !!(source.drm && source.drm.licenseServers && (source.drm.licenseServers.widevine || source.drm.licenseServers.playready));
    if (elements.currentDrm) elements.currentDrm.textContent = hasClearKey ? "Clear Key" : (hasLicense ? "Widevine/PlayReady" : "无 DRM");

    updateOrchestrationText(elements, state.lastEngineDecision);
    updateFallbackCooldownText(source);
}

function updateOrchestrationText(elements, engineDecision, executionPlan = null) {
    if (!elements.orchestrationText) return;
    if (!engineDecision) { elements.orchestrationText.textContent = '-'; return; }
    const strategy = String(engineDecision.strategy || 'compat');
    const requested = String(engineDecision.engine || '-');
    const executed = String((executionPlan?.playerType) || engineDecision.playerType || requested);
    const mapping = requested === executed ? requested : `${requested}->${executed}`;
    elements.orchestrationText.textContent = `${strategy} · ${mapping}`;
}

// ─── 主播放函数 ───

export async function playSource(source, elements) {
    const now = Date.now();
    const engineDecision = getPlaybackEngineDecision(source);
    state.lastEngineDecision = engineDecision;
    const executionPlan = resolveEngineExecutionPlan(engineDecision);
    const targetPlayerType = executionPlan.playerType;
    updateOrchestrationText(elements, engineDecision, executionPlan);

    const playFingerprint = `${targetPlayerType}|${String(source?.url || '').trim()}`;
    pushDiagnosticEvent(elements, { type: "play-request", level: "info", player: targetPlayerType, channel: source?.name || "", url: source?.url || "", message: `请求播放：${source?.name || "未命名"}`, meta: { engine: engineDecision.engine, playerType: targetPlayerType, reason: engineDecision.reason } });

    if (state.isLoadingSource && state.lastPlayFingerprint === playFingerprint && (now - state.lastPlayAt) < PLAY_REQUEST_DEDUP_MS) {
        updateStatus(elements, '相同播放请求正在加载', '加载中');
        return;
    }

    const requestId = ++state.playRequestSeq;
    state.lastPlayFingerprint = playFingerprint;
    state.lastPlayAt = now;

    if (state.isLoadingSource) {
        updateStatus(elements, '正在切换频道...', '切换中');
        if (state.globalAbortController) { state.globalAbortController.abort(); state.globalAbortController = null; }
        interruptCurrentPlayForSwitch().catch(error => console.warn('中断旧请求:', error));
    }
    state.isLoadingSource = true;
    state.globalAbortController = new AbortController();

    const playerType = targetPlayerType;
    await cleanupCurrentPlayer();

    const originalUrl = source.url;
    let playerTypeCode = playerType;

    try {
        let actualUrl = originalUrl;

        // 智能代理URL解包
        if (actualUrl.includes('/m3u-proxy?url=')) {
            try {
                let urlToParse = actualUrl;
                if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
                    urlToParse = urlToParse.startsWith('/') ? window.location.origin + urlToParse : window.location.origin + '/' + urlToParse;
                }
                const urlObj = new URL(urlToParse);
                const isExternalProxy = urlObj.origin !== window.location.origin;
                const isDashStream = isLikelyDashUrl(actualUrl);
                const pm = getTempProxyMode();
                if (isExternalProxy && (!isDashStream || pm !== 'm3u-proxy')) {
                    const urlParam = urlObj.searchParams.get('url');
                    if (urlParam) actualUrl = decodeURIComponent(urlParam);
                }
            } catch (e) { /* ignore */ }
        }

        pushDiagnosticEvent(elements, {
            type: 'play-url-prepare',
            level: 'info',
            player: targetPlayerType,
            channel: source?.name || '',
            url: actualUrl,
            message: '播放地址预处理完成',
            meta: {
                originalUrl,
                actualUrl,
                changed: String(originalUrl || '') !== String(actualUrl || ''),
                tempProxyMode: getTempProxyMode()
            }
        });

        // 混合内容保护
        const isDirectMode = getTempProxyMode() === 'direct';
        if (window.location.protocol === 'https:' && actualUrl.startsWith('http://') && !isDirectMode) {
            const httpsUrl = actualUrl.replace('http://', 'https://');
            pushDiagnosticEvent(elements, {
                type: 'mixed-content-probe',
                level: 'info',
                player: targetPlayerType,
                channel: source?.name || '',
                url: actualUrl,
                message: `HTTPS 页面下尝试将 HTTP 地址升级为 HTTPS: ${httpsUrl}`,
                meta: { originalUrl, actualUrl, httpsCandidateUrl: httpsUrl }
            });
            try {
                await fetch(httpsUrl, { method: 'HEAD', mode: 'no-cors' });
                actualUrl = httpsUrl;
                pushDiagnosticEvent(elements, {
                    type: 'mixed-content-upgrade',
                    level: 'info',
                    player: targetPlayerType,
                    channel: source?.name || '',
                    url: actualUrl,
                    message: 'HTTPS 试探成功，播放地址已切换为 HTTPS',
                    meta: { originalUrl, upgradedUrl: actualUrl }
                });
            } catch {
                const proxyFallbackUrl = getProxyUrl(actualUrl);
                pushDiagnosticEvent(elements, {
                    type: 'mixed-content-upgrade',
                    level: 'warn',
                    player: targetPlayerType,
                    channel: source?.name || '',
                    url: proxyFallbackUrl,
                    message: 'HTTPS 试探失败，回退到同源代理地址',
                    meta: { originalUrl, failedHttpUrl: actualUrl, proxyFallbackUrl, httpsCandidateUrl: httpsUrl }
                });
                actualUrl = proxyFallbackUrl;
            }
        }

        updateStatus(elements, `正在初始化播放器: ${source.name}`, "加载中");

        // 更新右侧当前播放信息
        updateCurrentInfo(elements, { ...source, url: actualUrl, playerType: playerTypeCode });

        // 根据播放器类型分发
        if (playerTypeCode === 'hls') {
            state.currentPlayerType = 'hls';
            const { initArtPlayer } = await import('./players/artplayer.js');
            await initArtPlayer(actualUrl, source, elements);
        } else if (playerTypeCode === 'mpegts') {
            state.currentPlayerType = 'mpegts';
            await ensureShakaDetached();
            const { initMpegtsPlayer } = await import('./players/mpegts.js');
            await initMpegtsPlayer(actualUrl, source, elements);
        } else if (playerTypeCode === 'native') {
            if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
            const _artCon = document.getElementById('artplayer-container');
            if (_artCon) _artCon.style.display = 'none';
            document.getElementById("video").style.display = '';
            state.currentPlayerType = 'native';
            await ensureShakaDetached();
            const { initNativeVideoPlayer } = await import('./players/native.js');
            await initNativeVideoPlayer(actualUrl, source, elements, {
                onFatalError: (error) => {
                    if (requestId !== state.playRequestSeq || state.currentPlayerType !== 'native') return;
                    const nativeError = error instanceof Error ? error : new Error(String(error || '原生播放器失败'));
                    nativeError.code = nativeError.code || 4011;
                    tryAlternativePlayers(elements, source, 'native', nativeError);
                }
            });
        } else if (playerTypeCode === 'shaka') {
            if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
            if (state.hlsPlayer) { state.hlsPlayer.destroy(); state.hlsPlayer = null; }
            const _artCon = document.getElementById('artplayer-container');
            if (_artCon) _artCon.style.display = 'none';
            document.getElementById("video").style.display = '';
            state.currentPlayerType = 'shaka';
            const attached = await ensureShakaAttached();
            if (!attached) throw new Error('Shaka Player 初始化失败，无法播放 DASH 源');
            assertDrmConfigBeforeShaka(source, actualUrl);
            applyShakaDrmConfigForSource(source);
            await loadShakaWithSmartFallback(source, actualUrl, 'Shaka ', requestId);
        } else {
            // auto 模式
            if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
            if (state.hlsPlayer) { state.hlsPlayer.destroy(); state.hlsPlayer = null; }
            const _artCon = document.getElementById('artplayer-container');
            if (_artCon) _artCon.style.display = 'none';
            document.getElementById("video").style.display = '';
            state.currentPlayerType = 'shaka';
            const attached = await ensureShakaAttached();
            if (!attached) throw new Error('Shaka Player 初始化失败，无法播放 DASH 源');
            assertDrmConfigBeforeShaka(source, actualUrl);
            applyShakaDrmConfigForSource(source);
            try {
                await loadShakaWithSmartFallback(source, actualUrl, 'auto Shaka ', requestId);
            } catch (error) {
                if (!isCorsRestricted(actualUrl)) {
                    state.currentPlayerType = 'hls';
                    const { initArtPlayer } = await import('./players/artplayer.js');
                    await initArtPlayer(actualUrl, source, elements);
                } else { throw error; }
            }
        }
        pushDiagnosticEvent(elements, { type: "play-init-ok", level: "info", player: state.currentPlayerType || playerTypeCode, channel: source?.name || "", url: actualUrl, message: "播放器初始化完成" });
    } catch (error) {
        if (requestId !== state.playRequestSeq || error.isCancelled) return;
        if (isBenignPlayInterruptedError(error)) return;
        console.error('播放失败:', error);
        
        // 播放失败时清理残留的播放器进程
        try {
            await cleanupCurrentPlayer();
        } catch (cleanupError) {
            console.warn('播放失败后清理残留进程出错:', cleanupError);
        }
        
        pushDiagnosticEvent(elements, {
            type: "play-error",
            level: "error",
            player: playerTypeCode || state.currentPlayerType || "unknown",
            channel: source?.name || "",
            url: source?.url || "",
            code: toDiagnosticErrorCode(error),
            message: toDiagnosticErrorMessage(error),
            error
        });
        updateStatus(elements, `播放失败: ${error.message}`, "错误", true);
        state.isLoadingSource = false;
        tryAlternativePlayers(elements, source, playerTypeCode, error);
    } finally {
        if (requestId === state.playRequestSeq) state.isLoadingSource = false;
    }
}

// ─── 回退系统 ───

async function tryAlternativePlayers(elements, source, failedPlayerType, originalError) {
    const { tryAlternativePlayers: _try } = await import('./players/fallback.js');
    await _try(elements, source, failedPlayerType, originalError);
}

export { getPlaybackEngineDecision, updateStatus, updateOrchestrationText, updateCurrentInfo };