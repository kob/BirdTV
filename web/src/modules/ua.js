/**
 * ua.js - User-Agent 下拉框选择（后端 API 版）
 * 全局 UA 通过顶栏下拉框选择，存到后端 settings
 * 同步读取使用内存缓存/localStorage，异步操作使用后端 API
 */

import { state } from './state.js';
import { DEFAULT_PROXY_UA, UA_PRESETS, GLOBAL_UA_KEY } from './constants.js';

const UA_API = '/api/settings/ua';

// 前端内存缓存
let _globalUaCache = null;
let _channelUaCache = {};

/**
 * 同步获取有效 User-Agent（兼容原有调用方式）
 * 使用优先级：source.userAgent > state.channel.userAgent > 内存缓存 > localStorage > 默认值
 * @param {Object} [source] - 可选的频道源对象，优先从中读取 userAgent
 */
export function getEffectiveUserAgent(source) {
    try {
        // 优先从传入的 source 对象读取
        if (source && typeof source === 'object') {
            const sourceUa = String(source.userAgent || "").trim();
            if (sourceUa) return sourceUa;
        }
        if (state.currentIndex >= 0 && state.currentIndex < state.channels.length) {
            const channel = state.channels[state.currentIndex];
            if (channel) {
                const channelUa = String(channel.userAgent || "").trim();
                if (channelUa) return channelUa;
            }
        }
        if (_globalUaCache) return _globalUaCache;
        const localUa = localStorage.getItem(GLOBAL_UA_KEY);
        if (localUa && localUa.trim()) return localUa.trim();
        return DEFAULT_PROXY_UA;
    } catch {
        return DEFAULT_PROXY_UA;
    }
}

/**
 * 异步获取全局 User-Agent（从后端加载，带缓存）
 */
export async function getGlobalUserAgent() {
    if (_globalUaCache) return _globalUaCache;
    try {
        const res = await fetch(`${UA_API}/global`);
        if (res.ok) {
            const data = await res.json();
            _globalUaCache = data.userAgent || DEFAULT_PROXY_UA;
            localStorage.setItem(GLOBAL_UA_KEY, _globalUaCache);
            return _globalUaCache;
        }
    } catch (e) {
        console.warn('[ua.js] 获取全局UA失败，使用本地缓存:', e);
    }
    return localStorage.getItem(GLOBAL_UA_KEY) || DEFAULT_PROXY_UA;
}

/**
 * 设置全局 User-Agent（同步写缓存+localStorage，异步写后端）
 */
export async function setGlobalUserAgent(userAgent) {
    const ua = userAgent || DEFAULT_PROXY_UA;
    _globalUaCache = ua;
    localStorage.setItem(GLOBAL_UA_KEY, ua);
    try {
        const res = await fetch(`${UA_API}/global`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userAgent: ua })
        });
        return res.ok;
    } catch (e) {
        console.error('[ua.js] 设置全局UA到后端失败:', e);
        return false;
    }
}

/**
 * 获取频道 User-Agent（带缓存）
 */
export async function getChannelUserAgent(channelId) {
    if (!channelId) return null;
    if (_channelUaCache[channelId] !== undefined) return _channelUaCache[channelId];
    try {
        const res = await fetch(`${UA_API}/channel?channelId=${encodeURIComponent(channelId)}`);
        if (res.ok) {
            const data = await res.json();
            _channelUaCache[channelId] = data.userAgent;
            return data.userAgent;
        }
    } catch (e) {
        console.warn('[ua.js] 获取频道UA失败:', e);
    }
    return null;
}

/**
 * 设置频道 User-Agent
 */
export async function setChannelUserAgent(channelId, userAgent) {
    if (!channelId) return false;
    _channelUaCache[channelId] = userAgent || null;
    try {
        const res = await fetch(`${UA_API}/channel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, userAgent: userAgent || null })
        });
        return res.ok;
    } catch (e) {
        console.error('[ua.js] 设置频道UA到后端失败:', e);
        return false;
    }
}

/**
 * 初始化 UA 下拉框：填充预设列表 + 自定义列表 + 选中当前全局 UA
 */
export async function initGlobalUaSelect(elements) {
    if (!elements.globalUaSelect) return;

    const seen = new Set();
    elements.globalUaSelect.innerHTML = '';

    // 1. 填充预设选项
    const presets = UA_PRESETS || [];
    for (const preset of presets) {
        if (!preset.value || seen.has(preset.value)) continue;
        seen.add(preset.value);
        const opt = document.createElement('option');
        opt.value = preset.value;
        opt.textContent = preset.name || preset.value;
        elements.globalUaSelect.appendChild(opt);
    }

    // 2. 填充用户自定义 UA（从 localStorage）
    const customUas = loadCustomUas();
    for (const ua of customUas) {
        if (seen.has(ua)) continue;
        seen.add(ua);
        const opt = document.createElement('option');
        opt.value = ua;
        opt.textContent = `自定义: ${ua.length > 40 ? ua.substring(0, 37) + '...' : ua}`;
        elements.globalUaSelect.appendChild(opt);
    }

    // 3. 加载当前全局 UA 并选中
    const currentUa = await getGlobalUserAgent();
    if (seen.has(currentUa)) {
        elements.globalUaSelect.value = currentUa;
    } else {
        const customOpt = document.createElement('option');
        customOpt.value = currentUa;
        customOpt.textContent = `当前: ${currentUa.length > 40 ? currentUa.substring(0, 37) + '...' : currentUa}`;
        elements.globalUaSelect.appendChild(customOpt);
        elements.globalUaSelect.value = currentUa;
    }
}

/**
 * 绑定 UA 下拉框 change 事件 + 自定义添加按钮
 */
export function bindGlobalUaSelect(elements) {
    if (!elements.globalUaSelect) return;

    elements.globalUaSelect.addEventListener('change', async () => {
        const ua = elements.globalUaSelect.value;
        await setGlobalUserAgent(ua);
    });

    // "+" 按钮切换显示输入框
    const addBtn = elements.addCustomUaButton;
    const input = elements.customUaInput;
    if (addBtn && input) {
        addBtn.addEventListener('click', () => {
            const visible = input.style.display !== 'none';
            if (visible) {
                // 如果已显示，尝试添加
                const ua = input.value.trim();
                if (ua) {
                    addCustomUa(elements, ua);
                    input.value = '';
                    input.style.display = 'none';
                }
            } else {
                input.style.display = '';
                input.focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const ua = input.value.trim();
                if (ua) {
                    addCustomUa(elements, ua);
                    input.value = '';
                    input.style.display = 'none';
                }
            }
            if (e.key === 'Escape') {
                input.value = '';
                input.style.display = 'none';
            }
        });
    }
}

/**
 * 添加自定义 UA 到下拉框并持久化
 */
function addCustomUa(elements, ua) {
    // 检查是否已存在
    const existing = Array.from(elements.globalUaSelect.options).find(o => o.value === ua);
    if (existing) {
        elements.globalUaSelect.value = ua;
        setGlobalUserAgent(ua);
        return;
    }

    // 添加到下拉框
    const opt = document.createElement('option');
    opt.value = ua;
    opt.textContent = `自定义: ${ua.length > 40 ? ua.substring(0, 37) + '...' : ua}`;
    elements.globalUaSelect.appendChild(opt);
    elements.globalUaSelect.value = ua;

    // 持久化到 localStorage
    const customUas = loadCustomUas();
    customUas.push(ua);
    saveCustomUas(customUas);

    // 同步到后端
    setGlobalUserAgent(ua);
}

const CUSTOM_UA_STORAGE_KEY = 'tvplayer.customUas.v1';

function loadCustomUas() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_UA_STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveCustomUas(list) {
    localStorage.setItem(CUSTOM_UA_STORAGE_KEY, JSON.stringify(list));
}

export async function handleLogout() {
    let authRequired = true;
    try {
        const healthResponse = await fetch('/health');
        if (healthResponse.ok) { const data = await healthResponse.json(); authRequired = data.authEnabled === true; }
    } catch {}

    const token = localStorage.getItem('authToken');
    if (authRequired && token) {
        try { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }); } catch {}
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    window.location.href = authRequired ? '/login.html' : window.location.href;
}
