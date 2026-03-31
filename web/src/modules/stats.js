/**
 * stats.js - 播放统计循环
 */

import { state } from './state.js';
import { updateFallbackCooldownText } from './players/fallback.js';
import { updateEpgDisplay } from './epg.js';

export function startStatsLoop(elements) {
    if (state.statsTimer) clearInterval(state.statsTimer);
    if (state.fallbackCooldownTimer) clearInterval(state.fallbackCooldownTimer);
    state.statsTimer = setInterval(() => refreshPlaybackStats(elements), 1500);
    state.fallbackCooldownTimer = setInterval(() => {
        const activeSource = (state.currentIndex >= 0 && state.currentIndex < state.channels.length) ? state.channels[state.currentIndex] : null;
        updateFallbackCooldownText(elements, activeSource);
    }, 1000);
    refreshPlaybackStats(elements);
}

function startEpgLoop(elements) {
    if (state.epgTimer) clearInterval(state.epgTimer);
    state.epgTimer = setInterval(() => {
        if (state.currentIndex >= 0 && state.currentIndex < state.channels.length) {
            updateEpgDisplay(elements, state.channels[state.currentIndex]);
        }
    }, 60 * 1000);
}

export function refreshPlaybackStats(elements) {
    const videoEl = document.getElementById("video");
    if (!state.player && !state.artPlayer) {
        if (elements.resolutionText) elements.resolutionText.textContent = "-";
        if (elements.bitrateText) elements.bitrateText.textContent = "-";
        if (elements.framesText) elements.framesText.textContent = "-";
        return;
    }

    const width = videoEl?.videoWidth;
    const height = videoEl?.videoHeight;
    if (elements.resolutionText) elements.resolutionText.textContent = width && height ? `${width}x${height}` : "-";

    let bandwidth = 0;
    if (state.currentPlayerType === 'shaka' && state.player) {
        try {
            const tracks = state.player.getVariantTracks();
            const active = tracks.find(t => t.active);
            bandwidth = active?.bandwidth || 0;
        } catch {}
    } else if (state.currentPlayerType === 'hls' && state.artPlayer?.hls) {
        try {
            const level = state.artPlayer.hls.currentLevel;
            if (level !== -1 && state.artPlayer.hls.levels?.[level]) bandwidth = state.artPlayer.hls.levels[level].bitrate || 0;
        } catch {}
    }

    if (elements.bitrateText) elements.bitrateText.textContent = bandwidth > 0 ? `${(bandwidth / 1000000).toFixed(2)} Mbps` : "-";

    let dropped = 0, total = 0;
    if (state.currentPlayerType === 'shaka' && state.player) {
        try { const stats = state.player.getStats(); dropped = Number(stats.droppedFrames) || 0; total = Number(stats.totalDecodedFrames) || 0; } catch {}
    }
    if (total <= 0 && typeof videoEl?.getVideoPlaybackQuality === "function") {
        const q = videoEl.getVideoPlaybackQuality();
        dropped = Number(q.droppedVideoFrames) || 0;
        total = Number(q.totalVideoFrames) || 0;
    }
    if (elements.framesText) elements.framesText.textContent = total > 0 ? `${dropped} / ${total}` : "-";
}

export { startEpgLoop };
