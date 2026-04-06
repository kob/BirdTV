/**
 * players/fallback.js - 播放器回退系统
 */

import { state } from '../state.js';
import { FALLBACK_ENGINE_COOLDOWN_BASE_MS, FALLBACK_ENGINE_COOLDOWN_MAX_MS } from '../constants.js';
import { toDiagnosticErrorCode, toDiagnosticErrorMessage, pushDiagnosticEvent, getCurrentPlaybackSnapshot } from '../diagnostics.js';
import { formatPlaybackError } from '../errors.js';

export function getFallbackEngineCooldownRemainingMs(source, playerType) {
    const key = getFallbackEngineCooldownKey(source, playerType);
    const item = state.fallbackEngineCooldown.get(key);
    if (!item) return 0;
    const remaining = Number(item.until || 0) - Date.now();
    return remaining > 0 ? remaining : 0;
}

export function registerFallbackEngineFailure(source, playerType, error) {
    if (!playerType) return 0;
    const key = getFallbackEngineCooldownKey(source, playerType);
    const now = Date.now();
    const previous = state.fallbackEngineCooldown.get(key);
    const prevFailures = previous?.until > now ? Number(previous.failures || 0) : 0;
    const failures = Math.min(prevFailures + 1, 6);
    const cooldownMs = Math.min(FALLBACK_ENGINE_COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, failures - 1)), FALLBACK_ENGINE_COOLDOWN_MAX_MS);
    state.fallbackEngineCooldown.set(key, { failures, until: now + cooldownMs, code: toDiagnosticErrorCode(error) });
    return cooldownMs;
}

export function clearFallbackEngineCooldownForPlayer(source, playerType) {
    if (!playerType) return;
    const key = getFallbackEngineCooldownKey(source, playerType);
    state.fallbackEngineCooldown.delete(key);
}

export function clearAllFallbackCooldown(reason = 'manual_clear') {
    state.fallbackEngineCooldown.clear();
    pushDiagnosticEvent(null, { type: 'fallback-cooldown-clear', level: 'info', player: state.currentPlayerType || 'none', message: '已清空回退冷却黑名单', meta: { reason } });
}

function getFallbackSourceFingerprint(source) {
    return `${String(source?.name || '').trim().toLowerCase()}|${String(source?.url || '').trim().toLowerCase()}`;
}

function getFallbackEngineCooldownKey(source, playerType) {
    return `${String(playerType || '').trim().toLowerCase()}|${getFallbackSourceFingerprint(source)}`;
}

export function getActiveFallbackCooldownEntries(source = null) {
    const now = Date.now();
    const sourceFp = source ? getFallbackSourceFingerprint(source) : null;
    const active = [];
    for (const [key, item] of state.fallbackEngineCooldown.entries()) {
        if (!item || Number(item.until || 0) <= now) { state.fallbackEngineCooldown.delete(key); continue; }
        const firstSep = key.indexOf('|');
        const playerType = firstSep > 0 ? key.slice(0, firstSep) : key;
        const itemSourceFp = firstSep > 0 ? key.slice(firstSep + 1) : '';
        if (sourceFp && itemSourceFp !== sourceFp) continue;
        active.push({ key, playerType, remainingMs: Number(item.until) - now, failures: Number(item.failures || 0), code: String(item.code || '') });
    }
    active.sort((a, b) => a.remainingMs - b.remainingMs);
    return active;
}

export function updateFallbackCooldownText(elements, source = null) {
    if (!elements.fallbackCooldownText) return;
    const active = getActiveFallbackCooldownEntries(source);
    if (!active.length) { elements.fallbackCooldownText.textContent = '-'; return; }
    const top = active.slice(0, 2).map(item => `${item.playerType}:${Math.max(1, Math.ceil(item.remainingMs / 1000))}s`);
    const extra = active.length > 2 ? ` +${active.length - 2}` : '';
    elements.fallbackCooldownText.textContent = `${top.join(', ')}${extra}`;
}

export async function tryAlternativePlayers(elements, source, failedPlayerType, originalError) {
    const { isLikelyDashUrl } = await import('../proxy.js');
    const { cleanupCurrentPlayer, ensureShakaDetached, ensureShakaAttached, loadShakaWithSmartFallback } = await import('../live.js');
    const { applyShakaDrmConfigForSource } = await import('../drm.js');

    const manualPlayerType = String(source?.playerType || '').trim().toLowerCase();
    const isManualLocked = manualPlayerType && manualPlayerType !== 'auto';

    const targetUrl = String(source?.url || '').toLowerCase();
    const isDashLike = targetUrl.includes('.mpd') || targetUrl.includes('/dash/') || String(source.streamType || '').toLowerCase() === 'mpd';

    if (isDashLike) {
        pushDiagnosticEvent(elements, { type: "fallback-skipped-dash", level: "info", player: failedPlayerType || 'unknown', code: toDiagnosticErrorCode(originalError), message: "DASH/MPD 源不自动切换播放器" });
        return false;
    }

    if (isManualLocked) {
        pushDiagnosticEvent(elements, { type: "fallback-skipped-manual", level: "warn", player: failedPlayerType || 'unknown', code: toDiagnosticErrorCode(originalError), message: `手动模式已锁定 ${manualPlayerType}，跳过自动回退` });
        return false;
    }

    registerFallbackEngineFailure(source, failedPlayerType, originalError);

    const failedCode = Number(originalError?.code);
    if (failedPlayerType === 'shaka' && (failedCode === 6601 || failedCode === 6602 || failedCode === 6012)) {
        pushDiagnosticEvent(elements, { type: "fallback-stop", level: "error", player: "shaka", code: String(failedCode), message: "DRM 错误，停止回退" });
        return false;
    }

    if (failedPlayerType === 'shaka' && isDashLike) {
        pushDiagnosticEvent(elements, { type: "fallback-stop", level: "error", player: "shaka", message: "MPD Shaka 失败，停止回退" });
        return false;
    }

    const fallbackOrder = buildFallbackOrder(source, failedPlayerType, failedCode);
    pushDiagnosticEvent(elements, { type: "fallback-plan", level: "info", player: failedPlayerType, message: `回退顺序: ${fallbackOrder.join(" -> ")}` });

    for (const playerType of fallbackOrder) {
        const cooldownRemainingMs = getFallbackEngineCooldownRemainingMs(source, playerType);
        if (cooldownRemainingMs > 0) continue;

        try {
            pushDiagnosticEvent(elements, { type: "fallback-attempt", level: "warn", player: playerType, message: `尝试回退到 ${playerType}` });
            if (elements) elements.statusText.textContent = `尝试 ${playerType} 播放器...`;

            await cleanupCurrentPlayer();
            const url = source.url;

            if (playerType === 'hls') {
                state.currentPlayerType = 'hls';
                const { initArtPlayer } = await import('./artplayer.js');
                await initArtPlayer(url, source, elements);
            } else if (playerType === 'mpegts') {
                state.currentPlayerType = 'mpegts';
                await ensureShakaDetached();
                const { initMpegtsPlayer } = await import('./mpegts.js');
                await initMpegtsPlayer(url, source, elements);
            } else if (playerType === 'native') {
                state.currentPlayerType = 'native';
                if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
                document.getElementById("video").style.display = '';
                await ensureShakaDetached();
                const { initNativeVideoPlayer } = await import('./native.js');
                await initNativeVideoPlayer(url, source, elements, { onFatalError: () => {} });
            } else if (playerType === 'shaka') {
                if (state.artPlayer) { state.artPlayer.destroy(true); state.artPlayer = null; }
                if (state.hlsPlayer) { state.hlsPlayer.destroy(); state.hlsPlayer = null; }
                document.getElementById("video").style.display = '';
                state.currentPlayerType = 'shaka';
                await ensureShakaAttached();
                applyShakaDrmConfigForSource(source);
                await loadShakaWithSmartFallback(source, url, '回退 Shaka ', state.playRequestSeq);
            } else {
                throw new Error(`未知回退播放器类型: ${playerType}`);
            }

            clearFallbackEngineCooldownForPlayer(source, playerType);
            return true;
        } catch (fallbackError) {
            registerFallbackEngineFailure(source, playerType, fallbackError);
            state.currentPlayerType = null;
        }
    }

    pushDiagnosticEvent(elements, { type: "fallback-exhausted", level: "error", message: "所有播放器回退失败" });
    return false;
}

function buildFallbackOrder(source, failedPlayerType, failedCode) {
    let baseOrder = ['hls', 'native', 'mpegts', 'shaka'];
    let priority = [];

    if (failedPlayerType === 'native' && (failedCode === 4010 || failedCode === 4011)) {
        priority = ['mpegts', 'shaka', 'hls'];
    } else if (failedPlayerType === 'vlc') {
        priority = ['shaka', 'hls', 'native', 'mpegts'];
    } else if (failedPlayerType === 'hls') {
        priority = ['native', 'mpegts', 'shaka'];
    } else if (failedPlayerType === 'shaka') {
        priority = ['hls', 'native', 'mpegts'];
    }

    const ordered = [];
    const merged = priority.concat(baseOrder);
    for (const type of merged) {
        if (!type || type === failedPlayerType || ordered.includes(type)) continue;
        ordered.push(type);
    }
    return ordered;
}
