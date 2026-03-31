/**
 * epg.js - 电子节目指南 (EPG)
 */

import { state } from './state.js';
import { EPG_CACHE_TTL } from './constants.js';
import { getEffectiveUserAgent } from './ua.js';
import { persistChannels } from './store.js';

export async function loadEpgData(elements, epgUrl, showStatus = false) {
    if (!epgUrl) { if (elements.epgMeta) elements.epgMeta.textContent = "EPG：未配置源"; return false; }

    const freshEnough = state.epgState.url === epgUrl && state.epgState.programsByChannelId.size > 0 && (Date.now() - state.epgState.loadedAt) < EPG_CACHE_TTL;
    if (freshEnough) { updateEpgDisplay(elements, state.channels[state.currentIndex]); return true; }

    if (elements.epgMeta) elements.epgMeta.textContent = "EPG：加载中...";
    try {
        const xmlText = await fetchEpgText(epgUrl);
        const parsed = parseXmltv(xmlText);
        state.epgState.url = epgUrl;
        state.epgState.loadedAt = Date.now();
        state.epgState.programsByChannelId = parsed.programsByChannelId;
        state.epgState.nameToChannelId = parsed.nameToChannelId;
        if (elements.epgMeta) elements.epgMeta.textContent = `EPG：已加载 ${parsed.programsByChannelId.size} 个频道`;
        updateEpgDisplay(elements, state.channels[state.currentIndex]);
        return true;
    } catch (error) {
        if (elements.epgMeta) elements.epgMeta.textContent = `EPG：加载失败`;
        return false;
    }
}

async function fetchEpgText(epgUrl) {
    const ua = getEffectiveUserAgent();
    // 自动带上 token
    const token = localStorage.getItem('authToken');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    
    // 1. 优先尝试代理
    try {
        let proxyUrl = `/m3u-proxy?url=${encodeURIComponent(epgUrl)}`;
        if (ua) proxyUrl += `&ua=${encodeURIComponent(ua.trim())}`;
        const resp = await fetch(proxyUrl, { cache: "no-store", headers });
        if (resp.ok) return readEpgResponseText(resp);
    } catch {}

    // 2. 尝试直接访问
    try {
        const resp = await fetch(epgUrl, { cache: "no-store", headers });
        if (resp.ok) return readEpgResponseText(resp);
    } catch (err) {
        // 3. 如果是 HTTP 链接且部署在 HTTPS 环境，尝试转换为 HTTPS
        const httpsUrl = epgUrl.replace(/^http:/i, 'https:');
        if (httpsUrl !== epgUrl && window.location.protocol === 'https:') {
            try {
                const resp = await fetch(httpsUrl, { cache: "no-store", headers });
                if (resp.ok) return readEpgResponseText(resp);
            } catch {}
        }
    }

    // 4. 最后回退到代理
    try {
        const resp = await fetch(`/m3u-proxy?url=${encodeURIComponent(epgUrl)}`, { cache: "no-store", headers });
        if (resp.ok) return readEpgResponseText(resp);
    } catch {}

    throw new Error("EPG 请求失败");
}

async function readEpgResponseText(response) {
    const rawBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(rawBuffer);
    const plainText = new TextDecoder("utf-8").decode(rawBuffer);

    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && !plainText.trim().startsWith("<")) {
        if (typeof DecompressionStream === "function") {
            try {
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
                const buffer = await new Response(stream).arrayBuffer();
                return new TextDecoder("utf-8").decode(buffer);
            } catch {}
        }
        if (window.pako?.ungzip) {
            try { return window.pako.ungzip(bytes, { to: "string" }); } catch {}
        }
    }

    return plainText;
}

function parseXmltv(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("EPG XML 解析失败");

    const programsByChannelId = new Map();
    const nameToChannelId = new Map();

    doc.querySelectorAll("channel").forEach(channelNode => {
        const channelId = (channelNode.getAttribute("id") || "").trim();
        if (!channelId) return;
        programsByChannelId.set(channelId, []);
        nameToChannelId.set(normalizeChannelKey(channelId), channelId);
        channelNode.querySelectorAll("display-name").forEach(nameNode => {
            const name = (nameNode.textContent || "").trim();
            if (name) nameToChannelId.set(normalizeChannelKey(name), channelId);
        });
    });

    doc.querySelectorAll("programme").forEach(programmeNode => {
        const channelId = (programmeNode.getAttribute("channel") || "").trim();
        if (!channelId) return;
        const start = parseXmltvTime(programmeNode.getAttribute("start") || "");
        const end = parseXmltvTime(programmeNode.getAttribute("stop") || "");
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
        const title = (programmeNode.querySelector("title")?.textContent || "").trim() || "未命名节目";
        const desc = (programmeNode.querySelector("desc")?.textContent || "").trim();
        if (!programsByChannelId.has(channelId)) programsByChannelId.set(channelId, []);
        programsByChannelId.get(channelId).push({ start, end, title, desc });
    });

    for (const programs of programsByChannelId.values()) programs.sort((a, b) => a.start - b.start);
    return { programsByChannelId, nameToChannelId };
}

function parseXmltvTime(raw) {
    const match = String(raw || "").trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+\-]\d{4}|Z))?/);
    if (!match) return NaN;
    const [, y, mo, d, h, mi, s, tz] = match;
    if (!tz) return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
    if (tz === "Z") return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    const sign = tz[0] === "+" ? 1 : -1;
    const offset = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5))) * 60 * 1000;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - offset;
}

function normalizeChannelKey(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[\-_.()[\]{}]/g, "");
}

function resolveEpgChannelId(source) {
    if (!source) return "";
    if (source.tvgId && state.epgState.programsByChannelId.has(source.tvgId)) return source.tvgId;
    for (const candidate of [source.tvgId, source.tvgName, source.name]) {
        const key = normalizeChannelKey(candidate);
        if (key) { const mapped = state.epgState.nameToChannelId.get(key); if (mapped) return mapped; }
    }
    return "";
}

function formatTime(ms) {
    if (!Number.isFinite(ms)) return "--:--";
    return new Date(ms).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function applyEpgUrlToChannels(epgUrl) {
    if (!epgUrl || !state.channels.length) return;
    state.channels = state.channels.map(s => ({ ...s, epg: s.epg || epgUrl }));
    persistChannels(state.channels);
}

export function openEpgModal(elements, source) {
    const target = source || state.channels[state.currentIndex] || null;
    if (!target) return;
    const channelId = resolveEpgChannelId(target);
    const programs = channelId ? (state.epgState.programsByChannelId.get(channelId) || []) : [];
    if (elements.epgModalTitle) elements.epgModalTitle.textContent = `节目单 · ${target.name}`;
    elements.epgModal.classList.add("open");
    elements.epgModal.setAttribute("aria-hidden", "false");
}

export function closeEpgModal(elements) {
    elements.epgModal.classList.remove("open");
    elements.epgModal.setAttribute("aria-hidden", "true");
}

export function updateEpgDisplay(elements, source) {
    if (!source || !state.epgState.programsByChannelId.size) {
        if (elements.epgNow) elements.epgNow.textContent = "当前：暂无 EPG 数据";
        if (elements.epgNowDesc) elements.epgNowDesc.textContent = "简介：-";
        return;
    }
    const channelId = resolveEpgChannelId(source);
    const programs = channelId ? (state.epgState.programsByChannelId.get(channelId) || []) : [];
    if (!programs.length) { if (elements.epgNow) elements.epgNow.textContent = "当前：未匹配到节目"; return; }

    const now = Date.now();
    let current = null;
    for (const program of programs) {
        if (program.start <= now && now < program.end) { current = program; continue; }
        if (program.start > now) break;
    }

    if (current) {
        if (elements.epgNow) elements.epgNow.textContent = `当前：${formatTime(current.start)}-${formatTime(current.end)} ${current.title}`;
        if (elements.epgNowDesc) elements.epgNowDesc.textContent = `简介：${current.desc || "暂无简介"}`;
    } else {
        if (elements.epgNow) elements.epgNow.textContent = "当前：暂无正在播出的节目";
    }
}

export function buildCatchupUrl(source, program) {
    if (!source?.catchup || !program) return "";
    const streamUrl = source.url || "";
    const template = source.catchupSource || "";
    const startUtc = Math.floor(program.start / 1000);
    const endUtc = Math.floor(program.end / 1000);
    const duration = endUtc - startUtc;
    const nowUtc = Math.floor(Date.now() / 1000);
    const offset = nowUtc - startUtc;
    const d = new Date(program.start);
    const pad = (n) => String(n).padStart(2, "0");
    const utcStr = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

    if (template) {
        const Y = d.getFullYear(), m = pad(d.getMonth()+1), dd = pad(d.getDate());
        const H = pad(d.getHours()), M = pad(d.getMinutes()), S = pad(d.getSeconds());
        const bTimestamp = `${Y}-${m}-${dd}-${H}-${M}-${S}`;
        const de = new Date(program.stop);
        const eTimestamp = `${de.getFullYear()}-${pad(de.getMonth()+1)}-${pad(de.getDate())}-${pad(de.getHours())}-${pad(de.getMinutes())}-${pad(de.getSeconds())}`;

        let result = template
            .replace(/\$\{\(b\)timestamp\}/g, bTimestamp)
            .replace(/\$\{\(e\)timestamp\}/g, eTimestamp)
            .replace(/\$\{start\}|\{start\}|\{utc\}|\$\{utc\}/g, String(startUtc))
            .replace(/\$\{end\}|\{end\}/g, String(endUtc))
            .replace(/\$\{duration\}|\{duration\}/g, String(duration))
            .replace(/\$\{offset\}|\{offset\}/g, String(offset))
            .replace(/\$\{timestamp\}|\{timestamp\}/g, utcStr)
            .replace(/\$\{url\}|\{url\}/g, streamUrl)
            .replace(/\{Y\}/g, Y).replace(/\{m\}/g, m).replace(/\{d\}/g, dd)
            .replace(/\{H\}/g, H).replace(/\{M\}/g, M).replace(/\{S\}/g, S);
        if (/^[&?]/.test(result)) return streamUrl + result;
        if (!/^https?:\/\//.test(result)) try { return new URL(result, streamUrl).toString(); } catch { /* fall through */ }
        return result;
    }

    const sep = streamUrl.includes("?") ? "&" : "?";
    return `${streamUrl}${sep}utc=${utcStr}&lutc=${startUtc}`;
}
