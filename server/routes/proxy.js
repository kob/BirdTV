/**
 * M3U 代理路由 - Express Router 版
 * 复用 birdtv.js 的核心代理函数，避免重写复杂的代理逻辑
 *
 * birdtv.js 导出的关键函数：
 * - proxyRequestToRemote(remoteUrl, clientReq, clientRes, options)
 * - requestRemotePayload(remoteUrl, options)
 * - getConfig(overrides)
 */

const express = require('express');
const { URL } = require('url');

function createProxyRouter(config, storage, birdtv) {
  const router = express.Router();

  /**
   * M3U 代理 - GET /m3u-proxy?url=xxx
   * 直接复用 birdtv.js 的 proxyRequestToRemote
   */
  router.get('/m3u-proxy', async (req, res) => {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl) {
        return res.status(400).json({ ok: false, error: '缺少 url 参数' });
      }

      const userAgent = req.query.ua || req.query['user-agent'] || null;
      const maxRedirects = parseInt(req.query['max-redirects'] || String(config.redirectLimit), 10);

      // 复用 birdtv.js 的代理核心
      await birdtv.proxyRequestToRemote(targetUrl, req, res, {
        config,
        userAgent,
        maxRedirects,
      });
    } catch (err) {
      console.error('[Proxy] m3u-proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: err.message });
      }
    }
  });

  /**
   * TV-iill 代理 - GET /tv-iill?url=xxx
   */
  router.get('/tv-iill', async (req, res) => {
    try {
      const targetUrl = req.query.url;
      if (!targetUrl) {
        return res.status(400).json({ ok: false, error: '缺少 url 参数' });
      }

      const userAgent = req.query.ua || req.query['user-agent'] || null;

      await birdtv.proxyRequestToRemote(targetUrl, req, res, {
        config,
        userAgent,
      });
    } catch (err) {
      console.error('[Proxy] tv-iill error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: err.message });
      }
    }
  });

  /**
   * TV-iill 路径代理 - GET /tv-iill/:encodedUrl
   */
  router.get('/tv-iill/*', async (req, res) => {
    try {
      const encodedPath = req.params[0];
      const targetUrl = decodeURIComponent(encodedPath);

      const userAgent = req.query.ua || req.query['user-agent'] || null;

      await birdtv.proxyRequestToRemote(targetUrl, req, res, {
        config,
        userAgent,
      });
    } catch (err) {
      console.error('[Proxy] tv-iill path error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ ok: false, error: err.message });
      }
    }
  });

  /**
   * M3U 远程代理 - GET /m3u-remote/*
   * 代理远程 M3U 源（预留）
   */
  router.get('/m3u-remote/*', async (req, res) => {
    res.status(501).json({ ok: false, error: 'Not Implemented' });
  });

  return router;
}

module.exports = { createProxyRouter };
