/**
 * redirect.js - URL 重定向检测
 */

import { state } from './state.js';
import { getProxyUrl } from './proxy.js';
import { getEffectiveUserAgent } from './ua.js';

export async function detectAndHandleRedirect(url, options = {}) {
    const { timeout = 3000, followRedirects = true, skipIfInterrupted = true } = options;

    if (skipIfInterrupted && state.globalAbortController?.signal.aborted) {
        return { url, redirected: false, finalUrl: url, status: 0, message: '检测被中断' };
    }

    if (state.redirectCache.has(url)) return state.redirectCache.get(url);
    if (state.activeRedirectChecks.has(url)) {
        await new Promise(resolve => setTimeout(resolve, 200));
        return state.redirectCache.get(url) || { url, redirected: false, finalUrl: url, status: 0 };
    }

    state.activeRedirectChecks.add(url);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        if (state.globalAbortController) {
            state.globalAbortController.signal.addEventListener('abort', () => controller.abort());
        }

        const ua = getEffectiveUserAgent();
        const proxyUrl = getProxyUrl(url, ua) + '&redirect-check=true';

        const response = await fetch(proxyUrl, {
            method: 'GET', mode: 'cors', redirect: 'manual',
            signal: controller.signal, headers: { 'Accept': '*/*' }
        });

        clearTimeout(timeoutId);
        let status = response.status;
        let redirected = response.redirected || (status >= 300 && status < 400);
        let redirectFinalUrl = url;

        if (response.headers.has('X-Redirected')) redirected = response.headers.get('X-Redirected') === 'true';
        if (response.headers.has('X-Final-Url')) redirectFinalUrl = response.headers.get('X-Final-Url');
        if (response.headers.has('X-Status-Code')) status = parseInt(response.headers.get('X-Status-Code'), 10) || status;

        if (!response.headers.has('X-Final-Url')) {
            try {
                const bodyText = await response.text();
                const match = /Final URL:\s*([^,\s]+)/i.exec(bodyText || '');
                if (match?.[1]) { redirectFinalUrl = match[1].trim(); redirected = redirectFinalUrl !== url; }
            } catch {}
        }

        const result = { url, redirected, finalUrl: redirectFinalUrl, status, message: redirected ? `检测到${status}重定向` : '未检测到重定向' };
        state.redirectCache.set(url, result);
        setTimeout(() => state.redirectCache.delete(url), 5 * 60 * 1000);
        return result;
    } catch (error) {
        return { url, redirected: false, finalUrl: url, status: 0, message: `检测失败: ${error.message}` };
    } finally {
        state.activeRedirectChecks.delete(url);
    }
}
