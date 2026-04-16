/**
 * diagnostics.js - 诊断系统
 */

import { state } from './state.js';
import { safeDiagText } from './utils.js';

const DIAGNOSTIC_MAX_EVENTS = 200;
const DIAGNOSTIC_RENDER_LIMIT = 80;

export function getCurrentPlaybackSnapshot(elements) {
    const video = elements?.video;
    return {
        player: state.currentPlayerType || "none",
        resolution: elements.resolutionText ? elements.resolutionText.textContent : "-",
        bitrate: elements.bitrateText ? elements.bitrateText.textContent : "-",
        frames: elements.framesText ? elements.framesText.textContent : "-",
        readyState: video ? Number(video.readyState || 0) : 0,
        currentTime: video ? Number(video.currentTime || 0) : 0
    };
}

export function toDiagnosticErrorCode(error) {
    if (!error) return "";
    if (typeof error.code === "number" || typeof error.code === "string") return String(error.code);
    if (error.details) return String(error.details);
    return "";
}

export function toDiagnosticErrorMessage(error) {
    if (!error) return "未知错误";
    if (typeof error === "string") return error;
    return String(error.message || error.reason || error.details || "未知错误");
}

export function pushDiagnosticEvent(elements, evt = {}) {
    const normalizedMeta = normalizeDiagnosticMeta(evt.meta, evt.error);
    const event = {
        id: ++state.diagnosticSeq,
        ts: Date.now(),
        type: String(evt.type || "event"),
        level: evt.level === "error" ? "error" : (evt.level === "warn" ? "warn" : "info"),
        player: evt.player || state.currentPlayerType || "none",
        code: evt.code == null ? "" : String(evt.code),
        message: evt.message || "",
        badge: evt.badge || "",
        url: evt.url || "",
        channel: evt.channel || "",
        meta: normalizedMeta
    };

    state.diagnosticEvents.push(event);
    if (state.diagnosticEvents.length > DIAGNOSTIC_MAX_EVENTS) {
        state.diagnosticEvents.splice(0, state.diagnosticEvents.length - DIAGNOSTIC_MAX_EVENTS);
    }
    mirrorDiagnosticEventToConsole(event);
    renderDiagnosticsPanel(elements);
    return event;
}

function normalizeDiagnosticMeta(meta, error) {
    const out = {};

    if (meta && typeof meta === 'object') {
        Object.assign(out, meta);
    }

    if (error) {
        out.errorName = String(error.name || 'Error');
        out.errorMessage = String(error.message || error.reason || 'unknown_error');
        if (error.code != null) out.errorCode = String(error.code);
        if (error.stack) out.errorStack = String(error.stack);
    }

    return Object.keys(out).length > 0 ? out : null;
}

function mirrorDiagnosticEventToConsole(event) {
    try {
        if (!event) return;
        const method = event.level === 'error' ? 'error' : (event.level === 'warn' ? 'warn' : 'info');
        const detail = [event.type || 'event', event.player ? `player=${event.player}` : '', event.channel ? `channel=${event.channel}` : '', event.code ? `code=${event.code}` : '']
            .filter(Boolean)
            .join(' ');
        const message = event.message || 'diagnostic_event';
        const payload = {
            id: event.id,
            ts: event.ts,
            isoTime: new Date(event.ts).toISOString(),
            level: event.level,
            type: event.type,
            player: event.player,
            channel: event.channel || '',
            code: event.code || '',
            badge: event.badge || '',
            url: event.url || '',
            currentIndex: state.currentIndex,
            currentPlayerType: state.currentPlayerType || 'none',
            lastEngineDecision: state.lastEngineDecision || null,
            meta: event.meta || null
        };

        console[method](`[BirdTV] ${detail} - ${message}`, payload);
        if (event.meta && event.meta.errorStack) {
            console[method]('[BirdTV] error stack', event.meta.errorStack);
        }
    } catch {
        // ignore console mirror failures
    }
}

export function renderDiagnosticsPanel(elements) {
    if (!elements || !elements.diagnosticsList) return;

    if (elements.diagnosticsCount) {
        elements.diagnosticsCount.textContent = `${state.diagnosticEvents.length} 条`;
    }

    const recent = state.diagnosticEvents.slice(-DIAGNOSTIC_RENDER_LIMIT).reverse();
    if (!recent.length) {
        elements.diagnosticsList.innerHTML = `<div class="diag-item"><span class="diag-time">--:--:--</span><span class="diag-text">暂无诊断记录</span></div>`;
        return;
    }

    elements.diagnosticsList.innerHTML = recent.map((item) => {
        const time = new Date(item.ts).toLocaleTimeString("zh-CN", { hour12: false });
        const levelClass = item.level === "error" ? "is-error" : (item.level === "warn" ? "is-warn" : "is-info");
        const detail = [item.player, item.code ? `#${item.code}` : "", item.badge ? `[${item.badge}]` : ""].filter(Boolean).join(" ");
        const tail = item.message || item.type;
        return `<div class="diag-item ${levelClass}"><span class="diag-time">${safeDiagText(time)}</span><span class="diag-text">${safeDiagText(detail ? `${detail} - ${tail}` : tail)}</span></div>`;
    }).join("");
}

export function exportDiagnostics(elements) {
    const activeChannel = (state.currentIndex >= 0 && state.currentIndex < state.channels.length) ? state.channels[state.currentIndex] : null;
    const payload = {
        exportedAt: new Date().toISOString(),
        currentPlayerType: state.currentPlayerType || null,
        activeChannel: activeChannel ? { name: activeChannel.name, url: activeChannel.url } : null,
        snapshot: getCurrentPlaybackSnapshot(elements),
        events: state.diagnosticEvents.slice(-DIAGNOSTIC_MAX_EVENTS)
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = href;
    a.download = `playback-diagnostics-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}
