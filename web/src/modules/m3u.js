/**
 * m3u.js - M3U 解析与导入
 */

import { state } from './state.js';
import { STORAGE_KEY, M3U_CONFIGS_KEY, EPG_CONFIGS_KEY } from './constants.js';
import { persistChannels, loadConfigs, saveConfigs } from './store.js';
import {
    shouldUseProxy, unwrapProxySourceUrl, isCorsRestricted,
    toSameOriginM3UProxyUrl, toTvIillSameOriginUrl, isLikelyDashUrl, isLikelyHlsStreamUrl
} from './proxy.js';
import { getEffectiveUserAgent } from './ua.js';
import { normalizeDrmConfig } from './drm.js';
import { HEVC_HINT_PATTERN } from './constants.js';
import { updateStatus as updateStatusLive } from './live.js';

function renderPlaylistInternal(elements) {
    const keyword = (elements.searchInput?.value || '').trim().toLowerCase();
    const filtered = state.channels.map((source, index) => ({ source, index })).filter(({ source }) => source.name.toLowerCase().includes(keyword));
    if (elements.playlist) elements.playlist.innerHTML = "";
    if (elements.channelCount) elements.channelCount.textContent = `${state.channels.length} 个`;
    filtered.forEach(({ source, index }) => {
        const item = document.createElement("div");
        item.className = `playlist-item${index === state.currentIndex ? " active" : ""}`;
        item.innerHTML = `<span class="ch-num">${index + 1}</span><strong>${source.name}</strong>`;
        item.addEventListener("click", async () => {
            state.currentIndex = index;
            updateStatusLive(elements, source.name, source.url || "");
            const { playSource } = await import('./live.js');
            await playSource({ ...source }, elements);
        });
        elements.playlist.appendChild(item);
    });
}

function setEpgMetaInternal(elements, text) {
    if (elements.epgMeta) elements.epgMeta.textContent = text;
}

function updateStatusInternal(elements, message, detail) {
    updateStatusLive(elements, message, detail);
}

export function normalizeStreamType(value, allowAuto = true) {
    const v = String(value || "").trim().toLowerCase();
    if (["mpd", "ts", "hls", "unknown"].includes(v)) return v;
    return allowAuto ? "auto" : "unknown";
}

export function getSelectedM3UImportType(selectEl) {
    if (!selectEl) return "auto";
    return normalizeStreamType(selectEl.value, true);
}

export function detectStreamTypeFromUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "unknown";
    const unwrapped = unwrapProxySourceUrl(raw) || raw;
    const lower = String(unwrapped).toLowerCase();
    if (isLikelyDashUrl(unwrapped)) return "mpd";
    if (isLikelyHlsStreamUrl(lower)) return "hls";
    if (/\/udp\/|\/rtp\//.test(lower) || /239\.\d+\.\d+\.\d+/.test(lower)) return "ts";
    try {
        const parsed = new URL(unwrapped);
        const pathname = String(parsed.pathname || "").toLowerCase();
        if (pathname.endsWith(".ts") || pathname.endsWith(".m2ts")) return "ts";
    } catch {}
    if (lower.includes("format=ts") || lower.includes("type=ts")) return "ts";
    return "unknown";
}

export function normalizeSource(source) {
    if (!source || typeof source !== "object") return null;
    const name = String(source.name || "").trim();
    const url = String(source.url || "").trim();
    if (!name || !url) return null;
    const normalized = { name, url };
    const drm = normalizeDrmConfig(source.drm);
    if (drm) normalized.drm = drm;
    if (source.tvgId) normalized.tvgId = source.tvgId;
    if (source.tvgName) normalized.tvgName = source.tvgName;
    if (source.epg) normalized.epg = source.epg;
    if (source.userAgent) normalized.userAgent = source.userAgent;
    // 保存源信息，用于继承默认播放器和代理模式
    if (source.sourceId) normalized.sourceId = source.sourceId;
    if (source.sourceName) normalized.sourceName = source.sourceName;
    if (source.sourceDefaultPlayerType) normalized.sourceDefaultPlayerType = source.sourceDefaultPlayerType;
    if (source.sourceProxyMode) normalized.sourceProxyMode = source.sourceProxyMode;
    const streamType = normalizeStreamType(source.streamType, false);
    if (['mpd', 'ts', 'hls', 'unknown'].includes(streamType)) normalized.streamType = streamType;
    if (['vlc', 'vlc-direct', 'vlc-proxy', 'shaka', 'hls', 'native', 'mpegts'].includes(source.playerType)) {
        // vlc/vlc-direct/vlc-proxy 旧数据兼容，回退为 auto
        normalized.playerType = ['vlc', 'vlc-direct', 'vlc-proxy'].includes(source.playerType) ? 'auto' : source.playerType;
    }
    if (source.catchup || source.catchupSource) {
        normalized.catchup = source.catchup || "default";
        if (source.catchupSource) normalized.catchupSource = source.catchupSource;
        if (source.catchupDays) normalized.catchupDays = source.catchupDays;
    }
    if (HEVC_HINT_PATTERN.test(name) || HEVC_HINT_PATTERN.test(source.tvgName || '')) {
        normalized.codecHint = 'hevc-risk';
    }
    return normalized;
}

export function normalizeM3UUrl(input) {
    const value = (input || "").trim();
    if (!value) return "";
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) return value;
    if (value.startsWith("//")) return `${window.location.protocol}${value}`;
    if (/^[a-zA-Z0-9.-]+(?::\d+)?\/.+/.test(value)) return `http://${value}`;
    return new URL(value, window.location.origin).toString();
}

export function parseM3UToSources(content, options = {}) {
    const { baseUrl = window.location.href, forcedStreamType = "auto", sourceInfo = null } = options;
    const lines = content.split(/\r?\n/);
    const sources = [];
    let pendingName = "", pendingKid = "", pendingKey = "", pendingTvgId = "", pendingTvgName = "";
    let pendingCatchup = "", pendingCatchupSource = "", pendingCatchupDays = "";

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("<") || line.startsWith("#EXTINF:")) {
            if (line.startsWith("#EXTINF:")) {
                const commaIndex = line.lastIndexOf(",");
                pendingName = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "未命名频道";
                const attrs = parseTagAttributes(line);
                pendingTvgId = String(attrs["tvg-id"] || "").trim();
                pendingTvgName = String(attrs["tvg-name"] || "").trim();
                pendingCatchup = String(attrs["catchup"] || "").trim();
                pendingCatchupSource = String(attrs["catchup-source"] || "").trim();
                pendingCatchupDays = String(attrs["catchup-days"] || "").trim();
                pendingKid = ""; pendingKey = "";
            }
            continue;
        }
        if (line.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
            const keyPair = line.replace("#KODIPROP:inputstream.adaptive.license_key=", "").trim();
            const parts = keyPair.split(":");
            if (parts.length >= 2) { pendingKid = parts[0].trim(); pendingKey = parts[1].trim(); }
            continue;
        }
        const candidateUrl = resolveM3ULineToUrl(line, baseUrl);
        if (candidateUrl) {
            const source = { name: pendingName || `频道 ${sources.length + 1}`, url: candidateUrl };
            source.streamType = detectStreamTypeFromUrl(candidateUrl);
            if (pendingTvgId) source.tvgId = pendingTvgId;
            if (pendingTvgName) source.tvgName = pendingTvgName;
            if (pendingCatchup) source.catchup = pendingCatchup;
            if (pendingCatchupSource) source.catchupSource = pendingCatchupSource;
            if (pendingCatchupDays) source.catchupDays = pendingCatchupDays;
            if (pendingKid && pendingKey) source.drm = { clearKeys: { [pendingKid]: pendingKey } };
            // 注入源信息（sourceDefaultPlayerType, sourceProxyMode 等）
            if (sourceInfo) {
                if (sourceInfo.sourceId) source.sourceId = sourceInfo.sourceId;
                if (sourceInfo.sourceDefaultPlayerType) source.sourceDefaultPlayerType = sourceInfo.sourceDefaultPlayerType;
                if (sourceInfo.sourceProxyMode) source.sourceProxyMode = sourceInfo.sourceProxyMode;
                if (sourceInfo.sourceName) source.sourceName = sourceInfo.sourceName;
            }
            sources.push(normalizeSource(source));
            pendingName = pendingKid = pendingKey = pendingTvgId = pendingTvgName = "";
            pendingCatchup = pendingCatchupSource = pendingCatchupDays = "";
        }
    }
    return sources.filter(Boolean);
}

function resolveM3ULineToUrl(line, baseUrl) {
    if (!line || line.startsWith("#")) return null;
    const pure = line.split("|")[0].trim();
    if (!pure) return null;
    try {
        if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(pure)) return pure;
        if (pure.startsWith("//")) return `${new URL(baseUrl).protocol || window.location.protocol}${pure}`;
        if (!pure.startsWith("/") && !/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(pure)) return new URL(pure, baseUrl).toString();
        return pure;
    } catch { return null; }
}

function parseTagAttributes(line) {
    const attrs = {};
    const pattern = /([\w-]+)="([^"]*)"/g;
    let match;
    while ((match = pattern.exec(line)) !== null) attrs[match[1].toLowerCase()] = match[2];
    return attrs;
}

export async function importFromM3UUrl(m3uUrl, elements, options = {}) {
    const { showStatus = true, persistAutoUrl = false, sourceLabel = "链接", forcedStreamType = "auto", sourceInfo = null } = options;
    const useProxy = shouldUseProxy(m3uUrl, false);
    const tvIillSameOriginUrl = toTvIillSameOriginUrl(m3uUrl, getEffectiveUserAgent());
    const corsRestricted = isCorsRestricted(m3uUrl);

    // 自动带上 token
    const token = localStorage.getItem('authToken');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

    // 构造解析选项，将源信息传递到每个频道
    const parseOpts = { baseUrl: m3uUrl, forcedStreamType, sourceInfo };

    if (useProxy && tvIillSameOriginUrl) {
        try {
            const resp = await fetch(tvIillSameOriginUrl, { cache: "no-store", headers });
            if (resp.ok) {
                const text = await resp.text();
                const imported = doImportFromM3UText(text, elements, { sourceLabel: `${sourceLabel}(同源代理)`, ...parseOpts });
                if (imported && persistAutoUrl) localStorage.setItem("tvplayer.autoM3uUrl.v1", m3uUrl);
                return imported;
            }
        } catch {}
    }

    // 尝试直接访问（如果可用）
    try {
        if (useProxy && corsRestricted) throw new TypeError('代理模式且跨域，跳过直连');
        const response = await fetch(m3uUrl, { cache: "no-store", headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const imported = doImportFromM3UText(text, elements, { sourceLabel: `${sourceLabel}(直接)`, ...parseOpts });
        if (imported && persistAutoUrl) localStorage.setItem("tvplayer.autoM3uUrl.v1", m3uUrl);
        return imported;
    } catch (err) {
        // 如果是 HTTP 链接且部署在 HTTPS 环境，尝试转换为 HTTPS
        const httpsUrl = m3uUrl.replace(/^http:/i, 'https:');
        if (httpsUrl !== m3uUrl && window.location.protocol === 'https:') {
            try {
                const response = await fetch(httpsUrl, { cache: "no-store", headers });
                if (response.ok) {
                    const text = await response.text();
                    const imported = doImportFromM3UText(text, elements, { sourceLabel: `${sourceLabel}(HTTPS)`, baseUrl: httpsUrl, sourceInfo });
                    if (imported && persistAutoUrl) localStorage.setItem("tvplayer.autoM3uUrl.v1", m3uUrl);
                    return imported;
                }
            } catch {}
        }
    }

    try {
        const proxyUrl = toSameOriginM3UProxyUrl(m3uUrl, getEffectiveUserAgent());
        if (proxyUrl) {
            const resp = await fetch(proxyUrl, { cache: "no-store", headers });
            if (resp.ok) {
                const text = await resp.text();
                const imported = doImportFromM3UText(text, elements, { sourceLabel: `${sourceLabel}(代理)`, ...parseOpts });
                if (imported && persistAutoUrl) localStorage.setItem("tvplayer.autoM3uUrl.v1", m3uUrl);
                return imported;
            }
        }
    } catch {}
    return false;
}

export function importFromM3UText(text, elements, options = {}) {
    return doImportFromM3UText(text, elements, options);
}

function doImportFromM3UText(text, elements, options = {}) {
    const { sourceLabel = "m3u", baseUrl = window.location.href, showStatus = true, sourceInfo = null, forcedStreamType = "auto" } = options;
    const imported = parseM3UToSources(text, { baseUrl, forcedStreamType, sourceInfo });
    if (imported.length === 0) return false;
    state.channels = imported;
    state.currentIndex = -1;
    persistChannels(state.channels);
    renderPlaylistInternal(elements);
    setEpgMetaInternal(elements, "EPG：请手动填写链接后加载");
    if (showStatus) updateStatusInternal(elements, `已从${sourceLabel}导入 ${state.channels.length} 个频道`, "导入成功");
    return true;
}

export async function tryLoadLocalM3U(elements, showStatus) {
    try {
        const response = await fetch("./mytv.m3u", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return doImportFromM3UText(text, elements, { sourceLabel: "mytv.m3u", baseUrl: window.location.href });
    } catch { return false; }
}
