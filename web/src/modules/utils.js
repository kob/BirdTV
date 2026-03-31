/**
 * utils.js - 工具函数
 */

export function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function safeDiagText(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function getHeaderCaseInsensitive(headers, name) {
    if (!headers || !name) return '';
    const target = String(name || '').toLowerCase();
    const keys = Object.keys(headers || {});
    for (const k of keys) {
        if (String(k || '').toLowerCase() === target) {
            const v = headers[k];
            return Array.isArray(v) ? String(v[0] || '') : String(v || '');
        }
    }
    return '';
}
