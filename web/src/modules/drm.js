/**
 * drm.js - DRM 配置管理
 */

import { state } from './state.js';
import { SHAKA_RETRY } from './constants.js';
import { isLikelyDashUrl, unwrapProxySourceUrl } from './proxy.js';

export function parseLicenseHeadersInput(raw) {
    const text = String(raw || "").trim();
    if (!text) return {};

    if (text.startsWith("{")) {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("License 请求头 JSON 必须是对象");
        const out = {};
        for (const [k, v] of Object.entries(parsed)) {
            const key = String(k || "").trim();
            const value = String(v || "").trim();
            if (key && value) out[key] = value;
        }
        return out;
    }

    const out = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const idx = trimmed.indexOf(":");
        if (idx <= 0) throw new Error(`License 请求头格式错误：${trimmed}`);
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!key || !value) throw new Error(`License 请求头格式错误：${trimmed}`);
        out[key] = value;
    }
    return out;
}

export function normalizeDrmConfig(drm) {
    if (!drm || typeof drm !== "object") return null;
    const result = {};

    const clearKeys = drm.clearKeys;
    if (clearKeys && typeof clearKeys === "object" && !Array.isArray(clearKeys)) {
        const normalized = {};
        for (const [kid, key] of Object.entries(clearKeys)) {
            const nk = String(kid || "").trim();
            const nv = String(key || "").trim();
            if (nk && nv) normalized[nk] = nv;
        }
        if (Object.keys(normalized).length > 0) result.clearKeys = normalized;
    }

    const servers = drm.licenseServers;
    if (servers && typeof servers === "object" && !Array.isArray(servers)) {
        const widevine = String(servers.widevine || "").trim();
        const playready = String(servers.playready || "").trim();
        if (widevine || playready) {
            result.licenseServers = {};
            if (widevine) result.licenseServers.widevine = widevine;
            if (playready) result.licenseServers.playready = playready;
        }
    }

    const headers = drm.licenseHeaders;
    if (headers && typeof headers === "object" && !Array.isArray(headers)) {
        const normalized = {};
        for (const [k, v] of Object.entries(headers)) {
            const nk = String(k || "").trim();
            const nv = String(v || "").trim();
            if (nk && nv) normalized[nk] = nv;
        }
        if (Object.keys(normalized).length > 0) result.licenseHeaders = normalized;
    }

    return Object.keys(result).length > 0 ? result : null;
}

export function buildShakaDrmRuntime(source) {
    const drm = source?.drm || {};
    const normalized = normalizeDrmConfig(drm) || {};
    const clearKeys = normalized.clearKeys || {};

    const licenseServers = normalized.licenseServers || {};
    const servers = {};
    const widevineUrl = String(licenseServers.widevine || "").trim();
    if (widevineUrl) servers["com.widevine.alpha"] = widevineUrl;
    const playreadyUrl = String(licenseServers.playready || "").trim();
    if (playreadyUrl) servers["com.microsoft.playready"] = playreadyUrl;

    const licenseHeaders = normalized.licenseHeaders || {};
    return { clearKeys, servers, licenseHeaders };
}

export function applyShakaDrmConfigForSource(source) {
    if (!state.player) return;
    const runtime = buildShakaDrmRuntime(source);
    state.shakaLicenseHeaders = runtime.licenseHeaders;

    const drmConfig = { retryParameters: SHAKA_RETRY };
    if (runtime.clearKeys && Object.keys(runtime.clearKeys).length > 0) {
        drmConfig.clearKeys = runtime.clearKeys;
    }
    if (runtime.servers && Object.keys(runtime.servers).length > 0) drmConfig.servers = runtime.servers;

    state.player.configure({ drm: drmConfig });
}

export function isCencDashUrl(url) {
    const lower = String(url || "").toLowerCase();
    if (!lower.includes(".mpd")) return false;
    return lower.includes("cenc") || lower.includes("__op/cenc") || lower.includes("cenc_m");
}

export function hasDrmCredentials(source) {
    const normalized = normalizeDrmConfig(source?.drm || {}) || {};
    const hasClearKeys = !!(normalized.clearKeys && Object.keys(normalized.clearKeys).length > 0);
    const hasLicense = !!(
        normalized.licenseServers &&
        (String(normalized.licenseServers.widevine || "").trim() || String(normalized.licenseServers.playready || "").trim())
    );
    return hasClearKeys || hasLicense;
}

export function hasLicenseServer(source) {
    const normalized = normalizeDrmConfig(source?.drm || {}) || {};
    return !!(
        normalized.licenseServers &&
        (String(normalized.licenseServers.widevine || "").trim() || String(normalized.licenseServers.playready || "").trim())
    );
}

export function assertDrmConfigBeforeShaka(source, url) {
    if (!isCencDashUrl(url)) return;
    const lower = String(url || "").toLowerCase();
    const requiresLicenseServer = lower.includes("cenc_m") || lower.includes("__op/cenc_m");
    if (requiresLicenseServer && !hasLicenseServer(source) && !hasDrmCredentials(source)) {
        console.warn("检测到 cenc_m MPD 且频道未显式配置 DRM 参数，将继续尝试播放并基于实际错误诊断。");
    }
}

export function hasDrmInfo(source) {
    if (!source?.drm || typeof source.drm !== 'object') return false;
    const drm = source.drm;
    const clearKeys = drm.clearKeys && typeof drm.clearKeys === 'object' ? Object.keys(drm.clearKeys).length > 0 : false;
    const licenseServers = drm.licenseServers && typeof drm.licenseServers === 'object'
        ? (String(drm.licenseServers.widevine || '').trim() || String(drm.licenseServers.playready || '').trim()) : '';
    return clearKeys || !!licenseServers;
}

export function deriveDrmProfile(source) {
    if (!source?.drm || typeof source.drm !== 'object') return 'none';
    const drm = source.drm;
    if (drm.licenseServers && (String(drm.licenseServers.widevine || '').trim() || String(drm.licenseServers.playready || '').trim())) return 'license-server';
    if (drm.clearKeys && typeof drm.clearKeys === 'object' && Object.keys(drm.clearKeys).length > 0) return 'clear-key';
    return 'none';
}

export function isLikelyHevcSource(source, url = '') {
    const HEVC_HINT_PATTERN = /(?:^|[\s_.\-|()\[\]])(hevc|h\.?265|x265)(?:$|[\s_.\-|()\[\]])/i;
    const sourceName = String(source?.name || '');
    const tvgName = String(source?.tvgName || '');
    const codecHint = String(source?.codecHint || '');
    const targetUrl = String(url || source?.url || '');
    return codecHint === 'hevc-risk' || codecHint === 'hevc-unsupported' ||
        HEVC_HINT_PATTERN.test(sourceName) || HEVC_HINT_PATTERN.test(tvgName) || HEVC_HINT_PATTERN.test(targetUrl);
}
