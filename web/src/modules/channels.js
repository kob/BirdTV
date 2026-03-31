/**
 * channels.js - 频道管理与 UI 组件
 */

import { state } from './state.js';
import { VLC_LINK_MODE_KEY, UHD_HINT_PATTERN, SHAKA_RETRY } from './constants.js';
import { getConnectionMode } from './proxy.js';

export function updatePlaybackModeLabel(elements) {
    const mode = getPlaybackMode();
    const textMap = { auto: "自动", original: "强制原画", stable: "稳定模式" };
    if (elements.modeText) elements.modeText.textContent = textMap[mode] || "自动";
}

export function getPlaybackMode() {
    return localStorage.getItem("tvplayer.playbackMode") || "auto";
}

export function getEffectiveVlcLinkMode(source = null, elements = {}) {
    const sourceMode = String(source && source.vlcLinkMode || '').trim();
    if (sourceMode === 'direct' || sourceMode === 'proxy') return sourceMode;
    const selectedMode = String((elements.vlcLinkModeSelect && elements.vlcLinkModeSelect.value) || localStorage.getItem(VLC_LINK_MODE_KEY) || '').trim();
    return selectedMode === 'direct' ? 'direct' : 'proxy';
}

export function updateVlcLinkModeLabel(source = null, elements = {}) {
    if (!elements.vlcLinkModeText) return;
    const mode = getEffectiveVlcLinkMode(source, elements);
    elements.vlcLinkModeText.textContent = mode === 'direct' ? '直链' : '代理';
}

export function updateConnectionModeLabel(elements = {}) {
    if (!elements.connectionModeText) return;
    const mode = getConnectionMode();
    const modeText = { 'auto': '自动', 'server': '服务端', 'client': '客户端' };
    elements.connectionModeText.textContent = modeText[mode] || '自动';
}

export function applyPlaybackProfile(elements = {}, options = {}) {
    const { isLikelyUhd = false, preferFallback = false } = options;
    if (!state.player) return;
    state.player.configure({
        manifest: { retryParameters: SHAKA_RETRY },
        drm: { retryParameters: SHAKA_RETRY },
        streaming: {
            lowLatencyMode: false,
            bufferingGoal: isLikelyUhd ? 35 : 24,
            rebufferingGoal: isLikelyUhd ? 4 : 2,
            bufferBehind: isLikelyUhd ? 90 : 45,
            retryParameters: SHAKA_RETRY,
            stallEnabled: true, stallThreshold: 3, stallSkip: 0.1, safeSeekOffset: 5
        },
        abr: {
            enabled: true,
            restrictions: isLikelyUhd && preferFallback ? { maxHeight: 1080, maxBandwidth: 8500000 } : {},
            advanced: { switchInterval: preferFallback ? 6 : 8, bandwidthUpgradeTarget: 0.9, bandwidthDowngradeTarget: 0.95 }
        }
    });
}

export { UHD_HINT_PATTERN };
