/**
 * store.js - localStorage 存储管理
 */

import { STORAGE_KEY } from './constants.js';

export function loadChannels() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch {
        return [];
    }
}

export function persistChannels(channels) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
}

export function loadConfigs(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(c => c && c.name && c.url) : [];
    } catch { return []; }
}

export function saveConfigs(key, configs) {
    localStorage.setItem(key, JSON.stringify(configs));
}
