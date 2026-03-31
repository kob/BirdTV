/**
 * config.js - 配置中心（M3U/EPG 源管理）
 */

import { state } from './state.js';
import { M3U_CONFIGS_KEY, EPG_CONFIGS_KEY } from './constants.js';
import { loadConfigs, saveConfigs } from './store.js';
import { escapeHtml } from './utils.js';

export async function fetchBackendSources(type) {
    try {
        const token = localStorage.getItem("authToken") || "";
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        const res = await fetch(`/api/sources/${type}`, { headers });
        if (res.ok) { const result = await res.json(); if (result.ok && Array.isArray(result.data)) return result.data.filter(s => s.enabled !== false && s.url); }
    } catch {}
    return [];
}

export async function refreshAllConfigUI(elements) {
    renderConfigList(elements, M3U_CONFIGS_KEY, elements.m3uConfigList);
    renderConfigList(elements, EPG_CONFIGS_KEY, elements.epgConfigList);

    // 获取后端源数据并渲染
    state._backendM3uSources = await fetchBackendSources('m3u');
    state._backendEpgSources = await fetchBackendSources('epg');

    // 渲染后端源列表
    renderBackendConfigList(elements, state._backendM3uSources, elements.m3uBackendList, 'm3u');
    renderBackendConfigList(elements, state._backendEpgSources, elements.epgBackendList, 'epg');

    // 填充下拉框
    populateSourceSelect(elements.m3uSourceSelect, M3U_CONFIGS_KEY, state._backendM3uSources);
    populateSourceSelect(elements.epgSourceSelect, EPG_CONFIGS_KEY, state._backendEpgSources);
}

function populateSourceSelect(selectEl, localStorageKey, backendSources) {
    if (!selectEl) return;

    // 获取本地配置
    const configs = loadConfigs(localStorageKey);

    // 清空现有选项
    selectEl.innerHTML = '';

    // 添加空选项
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- 选择源 --';
    selectEl.appendChild(defaultOption);

    // 添加本地配置选项
    configs.forEach(config => {
        const option = document.createElement('option');
        option.value = config.url;
        option.textContent = `[本地] ${config.name}`;
        selectEl.appendChild(option);
    });

    // 添加后端源选项
    if (backendSources && backendSources.length > 0) {
        backendSources.forEach(source => {
            const option = document.createElement('option');
            option.value = source.url;
            option.textContent = `[后端] ${source.name}`;
            if (source.channelCount !== undefined) {
                option.textContent += ` (${source.channelCount} 频道)`;
            }
            selectEl.appendChild(option);
        });
    }
}

function renderBackendConfigList(elements, sources, containerEl, type) {
    if (!containerEl) return;

    if (!sources || sources.length === 0) {
        containerEl.innerHTML = `<div class="config-list-empty">后端暂无${type === 'm3u' ? 'M3U' : 'EPG'}源</div>`;
        return;
    }

    containerEl.innerHTML = sources.map((s) => {
        return `<div class="config-item backend-source-item" data-id="${s.id}" data-type="${type}">
            <span class="config-item-name">${escapeHtml(s.name)}</span>
            <span class="config-item-url">${escapeHtml(s.url)}</span>
            <span class="config-item-meta">
                ${s.channelCount !== undefined ? `<span class="config-item-channel-count">频道: ${s.channelCount}</span>` : ''}
                ${s.enabled !== false ? '<span class="config-item-enabled">✓</span>' : '<span class="config-item-disabled">✗</span>'}
            </span>
        </div>`;
    }).join('');
}

function renderConfigList(elements, key, containerEl) {
    if (!containerEl) return;
    const configs = loadConfigs(key);
    if (!configs.length) { containerEl.innerHTML = '<div class="config-list-empty">暂无配置</div>'; return; }
    containerEl.innerHTML = configs.map((c, i) => {
        return `<div class="config-item" data-index="${i}">
            <span class="config-item-name">${escapeHtml(c.name)}</span>
            <span class="config-item-url">${escapeHtml(c.url)}</span>
            <button class="secondary config-delete-btn" data-config-key="${key}" data-config-name="${escapeHtml(c.name)}">删除</button>
        </div>`;
    }).join('');
}

export function addConfig(key, name, url) {
    const configs = loadConfigs(key);
    const idx = configs.findIndex(c => c.name === name.trim());
    if (idx >= 0) configs[idx].url = url.trim();
    else configs.push({ name: name.trim(), url: url.trim() });
    saveConfigs(key, configs);
}

export function removeConfig(key, name) {
    const configs = loadConfigs(key).filter(c => c.name !== name);
    saveConfigs(key, configs);
}
