/**
 * proxy.js - 代理与网络模块
 */

import { state } from './state.js';
import {
    PROXY_HEALTH_TIMEOUT_MS, PROXY_HEALTH_TTL_MS,
    SHAKA_LOAD_TIMEOUT_MS, SHAKA_PROXY_LOAD_TIMEOUT_MS,
    DEFAULT_PROXY_UA
} from './constants.js';
import { getHeaderCaseInsensitive } from './utils.js';

// ─── 代理模式管理 ───

export function getConnectionMode() {
    return state.connectionMode;
}

export function setConnectionMode(mode) {
    if (['auto', 'server', 'client'].includes(mode)) {
        state.connectionMode = mode;
        localStorage.setItem('tvplayer.connectionMode', mode);
        return true;
    }
    return false;
}

export function getTempProxyMode() {
    return state.tempProxyMode;
}

export function setTempProxyMode(mode) {
    if (['auto', 'm3u-proxy', 'direct'].includes(mode)) {
        state.tempProxyMode = mode;
        localStorage.setItem('tvplayer.tempProxyMode', mode);
        return true;
    }
    return false;
}

export function getProxyMode() {
    return state.proxyMode;
}

export function setProxyMode(mode) {
    if (['auto', 'm3u-proxy', 'direct'].includes(mode)) {
        state.proxyMode = mode;
        localStorage.setItem('tvplayer.proxyMode', mode);
        return true;
    }
    return false;
}

// ─── 代理判断 ───

export function isLikelyDashUrl(url = '') {
    const detectedUrl = unwrapProxySourceUrl(url) || url;
    const lower = String(detectedUrl || '').toLowerCase();
    return lower.includes('.mpd') ||
        lower.includes('/dash/') ||
        lower.includes('manifest.mpd') ||
        lower.includes('type=mpd') ||
        lower.includes('format=mpd') ||
        lower.includes('contenttype=mpd');
}

export function isLikelyHlsStreamUrl(urlLower) {
    return urlLower.includes('.m3u8') ||
        urlLower.includes('/hls/') ||
        urlLower.includes('hls.m3u8') ||
        urlLower.includes('index.m3u8') ||
        urlLower.includes('playlist.m3u8') ||
        urlLower.includes('master.m3u8') ||
        urlLower.includes('stream.m3u8') ||
        urlLower.includes('type=m3u8') ||
        urlLower.includes('format=m3u8');
}

export function shouldUseProxy(url, preferDirectLan = false, source = null) {
    // tv.iill.top 域名强制直连（避免 Cloudflare Bot 检测）
    try {
        const urlObj = new URL(url);
        if (String(urlObj.hostname || '').toLowerCase().endsWith('tv.iill.top')) {
            return false;
        }
    } catch {}

    // 检查源的代理模式设置
    if (source && source.sourceProxyMode) {
        const sourceProxyMode = String(source.sourceProxyMode).trim().toLowerCase();
        if (sourceProxyMode === 'direct') return false;
        if (sourceProxyMode === 'proxy') return true;
    }

    const currentMode = getTempProxyMode();
    if (currentMode === 'direct') return false;
    if (currentMode === 'm3u-proxy') return true;

    // auto 模式下，DASH/MPD 保持直连优先，避免自动切换到代理。
    if (isLikelyDashUrl(url)) return false;

    if (window.location.protocol === 'https:' && url.startsWith('http://')) {
        return true;
    }
    return true;
}

export function isCorsRestricted(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const target = unwrapProxySourceUrl(url) || url;
        const urlObj = new URL(target);
        const currentOrigin = window.location.origin;
        if (urlObj.hostname === '127.0.0.1' ||
            urlObj.hostname === 'localhost' ||
            urlObj.hostname === window.location.hostname) {
            return false;
        }
        return urlObj.origin !== currentOrigin;
    } catch {
        return true;
    }
}

export function isLanUdpxyHttpTsUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        const host = String(u.hostname || '').toLowerCase();
        const path = String(u.pathname || '').toLowerCase();
        const isUdpxyPath = path.includes('/udp/') || path.includes('/rtp/');
        const isMulticastHint = /239\.\d+\.\d+\.\d+/.test(`${u.pathname || ''}${u.search || ''}`);
        const isLanHost =
            host === 'localhost' || host === '127.0.0.1' ||
            host.startsWith('192.168.') || host.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
        return isLanHost && (isUdpxyPath || isMulticastHint);
    } catch { return false; }
}

// ─── 代理URL生成 ───

export function getProxyUrl(url, userAgent = null) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file:')) return url;

    // tv.iill.top 域名强制直连（避免 Cloudflare Bot 检测）
    try {
        const urlObj = new URL(url);
        if (String(urlObj.hostname || '').toLowerCase().endsWith('tv.iill.top')) {
            return url;
        }
    } catch {}

    const unwrapped = unwrapProxySourceUrl(url);
    if (String(unwrapped || '') !== String(url || '')) {
        return toSameOriginM3UProxyUrl(unwrapped, userAgent);
    }

    try {
        const encodedUrl = encodeURIComponent(url);
        const effectiveUserAgent = String(userAgent || '').trim();
        const tempMode = getTempProxyMode();

        if (tempMode === 'direct') return url;

        let proxyUrl = `/m3u-proxy?url=${encodedUrl}`;
        if (effectiveUserAgent) {
            proxyUrl += `&ua=${encodeURIComponent(effectiveUserAgent)}`;
        }
        return proxyUrl;
    } catch (error) {
        console.error('获取代理URL失败:', error);
        return url;
    }
}

export function toSameOriginM3UProxyUrl(m3uUrl, userAgent = null) {
    if (!m3uUrl) return null;

    // tv.iill.top 域名强制直连（避免 Cloudflare Bot 检测）
    try {
        const urlObj = new URL(m3uUrl);
        if (String(urlObj.hostname || '').toLowerCase().endsWith('tv.iill.top')) {
            return m3uUrl;
        }
    } catch {}

    let proxyUrl = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent(m3uUrl)}`;
    if (userAgent && userAgent.trim()) {
        proxyUrl += `&ua=${encodeURIComponent(userAgent.trim())}`;
    }
    return proxyUrl;
}

export function toTvIillSameOriginUrl(url, userAgent = null) {
    // tv.iill.top 域名强制直连，不再生成代理 URL
    return url;
}

export function unwrapProxySourceUrl(url) {
    if (!url || typeof url !== 'string') return url;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.origin !== window.location.origin) return parsed.toString();
        const isProxyPath = String(parsed.pathname || '').toLowerCase().endsWith('/m3u-proxy');
        const nestedSource = parsed.searchParams.get('url');
        if (isProxyPath && nestedSource) return nestedSource;
        return parsed.toString();
    } catch { return url; }
}

export function isWrappedM3UProxyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.origin !== window.location.origin) return false;
        return String(parsed.pathname || '').toLowerCase().endsWith('/m3u-proxy') && !!parsed.searchParams.get('url');
    } catch { return false; }
}

// ─── 代理健康检查 ───

export function markProxyUnhealthy(reason) {
    state.proxyHealthState.checkedAt = Date.now();
    state.proxyHealthState.healthy = false;
    if (reason) console.warn('代理健康状态: 不可用 -', reason);
}

export function markProxyHealthy() {
    state.proxyHealthState.checkedAt = Date.now();
    state.proxyHealthState.healthy = true;
}

export async function checkProxyHealth(force = false) {
    const now = Date.now();
    if (!force && state.proxyHealthState.healthy !== null && (now - state.proxyHealthState.checkedAt) < PROXY_HEALTH_TTL_MS) {
        return state.proxyHealthState.healthy;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_HEALTH_TIMEOUT_MS);

    try {
        const localResp = await fetch('/health', { method: 'GET', cache: 'no-store', signal: controller.signal });
        if (localResp.ok) { clearTimeout(timer); markProxyHealthy(); return true; }

        const probeUrl = `${window.location.origin}/m3u-proxy?url=${encodeURIComponent('https://example.com/')}`;
        const legacyResp = await fetch(probeUrl, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
        clearTimeout(timer);
        if (legacyResp.ok || legacyResp.status === 405 || legacyResp.status === 403) { markProxyHealthy(); return true; }
        markProxyUnhealthy(`health status=${localResp.status}/${legacyResp.status}`);
        return false;
    } catch (error) {
        clearTimeout(timer);
        markProxyUnhealthy(error?.message || 'health check failed');
        return false;
    }
}

export async function shouldPreferProxyFirst() {
    try { return await checkProxyHealth(false); } catch { return false; }
}
