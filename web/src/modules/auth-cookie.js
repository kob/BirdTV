/**
 * auth-cookie.js - 认证 Cookie 管理（支持 HTTPS）
 */

/**
 * 设置认证 Cookie（自动检测 HTTPS）
 * @param {string} token - JWT Token
 */
export function setAuthCookie(token) {
    if (!token) return;
    
    // HTTPS 环境下添加 Secure 标志
    const isHttps = window.location.protocol === 'https:';
    const secureFlag = isHttps ? '; Secure' : '';
    
    // 设置 Cookie
    document.cookie = `authToken=${token}; path=/; SameSite=Strict${secureFlag}`;
    
    // 可选：设置过期时间（7 天，与 Token 有效期一致）
    // const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // document.cookie = `authToken=${token}; path=/; SameSite=Strict${secureFlag}; expires=${expires.toUTCString()}`;
}

/**
 * 清除认证 Cookie
 */
export function clearAuthCookie() {
    document.cookie = 'authToken=; path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

/**
 * 从 Cookie 获取 Token（备用方案）
 * @returns {string|null}
 */
export function getTokenFromCookie() {
    const match = document.cookie.match(/(?:^|;\s*)authToken=([^;]*)/);
    return match ? match[1] : null;
}
