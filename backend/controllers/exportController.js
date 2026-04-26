const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const exportModel = require('../models/Export');
const linkModel = require('../models/Link');
const tokenService = require('../services/tokenService');

class ExportController {
  constructor(storage) {
    this.storage = storage;
  }

  async exportChannels(req, res) {
    try {
      const { channelIds, description = '', useShortLink = false, filename: customFilename = '' } = req.body;
      
      if (!channelIds || !Array.isArray(channelIds)) {
        return res.status(400).json({ ok: false, message: 'Channel IDs are required' });
      }

      // 处理自定义文件名
      let filename;
      if (customFilename && customFilename.trim()) {
        // 清理文件名，移除非法字符和 .m3u 后缀（后端统一添加）
        filename = customFilename.trim().replace(/[/\\:*?"<>|]/g, '_').replace(/\.m3u$/i, '') + '.m3u';
      }

      // Get selected channels
      const allChannels = await this.storage.getChannels();
      const channels = allChannels.filter(channel => channelIds.includes(channel.id));
      if (!channels.length) {
        return res.status(400).json({ ok: false, message: 'No channels found' });
      }

      // 获取全局 UA 作为默认值
      const settings = await this.storage.getSettings();
      const globalUA = settings.globalUserAgent || null;

      const exportDir = path.resolve(__dirname, '../../data/exports');

      // 同名覆盖：删除已有的同名导出记录（不删文件，新文件会覆盖写入），保留关联短链接
      if (filename) {
        const existingExports = exportModel.getAll();
        const existing = existingExports.find(e => e.filename === filename);
        if (existing) {
          // 只删记录不删文件（新 M3U 内容稍后写入同名路径覆盖旧文件）
          exportModel.deleteRecordOnly(existing.id);
        }
      }

      // 生成 16 字符随机导出 Token（24 小时有效期）
      const encodedToken = crypto.randomBytes(8).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      
      // 获取当前服务器地址
      const reqHeaders = req.headers || {};
      const protocol = reqHeaders['x-forwarded-proto'] || req.protocol || 'http';
      const host = reqHeaders['x-forwarded-host'] || (req.get ? req.get('host') : '') || '';
      let baseUrl = host ? `${protocol}://${host}` : '';
      // 如果请求头中无法获取域名，从设置中读取
      if (!baseUrl) {
        const settings = await this.storage.getSettings();
        baseUrl = (settings && settings.m3uRemoteBaseUrl) ? settings.m3uRemoteBaseUrl.replace(/\/+$/, '') : 'http://localhost:8771';
      }

      // Generate M3U content (完整格式，包含 DRM 信息和原始 URL)
      let m3uContent = '#EXTM3U\n';
      
      // 如果使用短链接模式，先创建短链接
      let shortLinkData = null;
      if (useShortLink) {
        const linkModel = require('../models/Link');
        const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const filename = `${exportId}.m3u`;
        const exportDir = path.resolve(__dirname, '../../data/exports');
        const filePath = path.join(exportDir, filename);
        
        // 先写入临时 M3U 文件（不含 Token）
        let tempM3uContent = '#EXTM3U\n';
        channels.forEach(channel => {
          const tvgId = channel.tvgId || '';
          const tvgName = channel.name || '';
          const tvgLogo = channel.tvgLogo || '';
          const groupTitle = channel.group || '未分组';

          let extinfLine = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}"`;
          if (tvgLogo) {
            extinfLine += ` tvg-logo="${tvgLogo}"`;
          }
          extinfLine += ` group-title="${groupTitle}",${tvgName}`;
          tempM3uContent += extinfLine + '\n';

          // 添加 User-Agent 信息（优先频道 UA，否则全局 UA）
          const effectiveUA = channel.userAgent || globalUA;
          if (effectiveUA) {
            tempM3uContent += `#EXTVLCOPT:http-user-agent=${effectiveUA}\n`;
          }

          if (channel.drm && channel.drm.clearKeys) {
            tempM3uContent += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
            tempM3uContent += '#KODIPROP:inputstream.adaptive.license_type=clearkey\n';
            const firstKey = Object.entries(channel.drm.clearKeys)[0];
            if (firstKey) {
              const [kid, key] = firstKey;
              tempM3uContent += `#KODIPROP:inputstream.adaptive.license_key=${kid}:${key}\n`;
            }
          }
          // 添加 UA 到代理 URL（相对路径补全为完整 URL）
          let shortUrl = channel.url;
          if (shortUrl.startsWith('/m3u-proxy') || shortUrl.startsWith('/stream/proxy')) {
            shortUrl = baseUrl + shortUrl;
          }
          if (shortUrl.includes('/m3u-proxy') || shortUrl.includes('/stream/proxy')) {
            const separator = shortUrl.includes('?') ? '&' : '?';
            shortUrl += `${separator}ua=${encodeURIComponent(effectiveUA)}`;
          }
          tempM3uContent += `${shortUrl}\n`;
        });
        
        fs.writeFileSync(filePath, tempM3uContent);
        const fileSize = fs.statSync(filePath).size;
        
        // 创建导出记录
        const exportRecord = exportModel.create({
          id: exportId,
          filename,
          userId: req.user?.username || 'admin',
          description: description,
          fileSize,
          exportToken: encodedToken,
          tokenExpiresAt
        });
        
        // 创建短链接
        const linkRecord = linkModel.create({
          exportId,
          filename,
          userId: req.user?.username || 'admin',
          username: 'export',
          description: description,
          expiresAt: tokenExpiresAt,
          maxDownloads: 999999,
          ipBinding: null
        });
        
        const shortCode = linkRecord.shortCode;
        shortLinkData = {
          shortCode,
          shortLink: `${baseUrl}/link/${shortCode}`
        };
      }
      
      // 生成 M3U 内容
      channels.forEach(channel => {
        const tvgId = channel.tvgId || '';
        const tvgName = channel.name || '';
        const tvgLogo = channel.tvgLogo || '';
        const groupTitle = channel.group || '未分组';

        let extinfLine = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}"`;
        if (tvgLogo) {
          extinfLine += ` tvg-logo="${tvgLogo}"`;
        }
        extinfLine += ` group-title="${groupTitle}",${tvgName}`;
        m3uContent += extinfLine + '\n';

        // 添加 User-Agent 信息（优先频道 UA，否则全局 UA）
        const effectiveUA = channel.userAgent || globalUA;
        if (effectiveUA) {
          m3uContent += `#EXTVLCOPT:http-user-agent=${effectiveUA}\n`;
        }

        // 添加 KODIPROP 信息（如果有 DRM）
        if (channel.drm && channel.drm.clearKeys) {
          m3uContent += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
          m3uContent += '#KODIPROP:inputstream.adaptive.license_type=clearkey\n';
          const firstKey = Object.entries(channel.drm.clearKeys)[0];
          if (firstKey) {
            const [kid, key] = firstKey;
            m3uContent += `#KODIPROP:inputstream.adaptive.license_key=${kid}:${key}\n`;
          }
        }

        // 如果使用短链接模式，使用短链接；否则使用代理 URL + auth_token
        if (useShortLink && shortLinkData) {
          // 短链接模式：直接使用短链接（会在访问时动态生成 Token）
          m3uContent += `${shortLinkData.shortLink}\n`;
        } else {
          // 传统模式：为代理 URL 添加 auth_token 和 ua
          let finalUrl = channel.url;
          // 相对路径补全为完整 URL
          if (finalUrl.startsWith('/m3u-proxy') || finalUrl.startsWith('/stream/proxy')) {
            finalUrl = baseUrl + finalUrl;
          }
          if (finalUrl.includes('/m3u-proxy') || finalUrl.includes('/stream/proxy')) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${separator}auth_token=${encodedToken}`;
            // 添加 UA：优先使用频道 UA，否则使用全局 UA
            const effectiveUA = channel.userAgent || globalUA;
            if (effectiveUA) {
              finalUrl += `&ua=${encodeURIComponent(effectiveUA)}`;
            }
          }
          m3uContent += `${finalUrl}\n`;
        }
      });

      // Generate export ID and filename
      const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (!filename) filename = `${exportId}.m3u`;
      const filePath = path.join(exportDir, filename);
      console.log(`Writing M3U file to: ${filePath}`);

      // Write M3U file
      fs.writeFileSync(filePath, m3uContent);
      const fileSize = fs.statSync(filePath).size;

      // Create export record
      const exportRecord = exportModel.create({
        id: exportId,
        filename,
        userId: req.user?.username || 'admin',
        description: description,
        fileSize,
        exportToken: encodedToken, // 保存 Token 以便后续查询
        tokenExpiresAt
      });

      // 将同名文件关联的旧短链接的 exportId 更新为新记录 ID，保持短链接持续有效
      const linksForFile = linkModel.getByFilename(filename);
      linksForFile.forEach(link => {
        if (link.exportId !== exportId) {
          linkModel.update(link.id, { exportId });
        }
      });

      res.json({
        ok: true,
        data: {
          exportId,
          filename,
          fileSize,
          description,
          downloadUrl: `${baseUrl}/api/exports/download?file=${filename}&token=${encodedToken}`,
          token: encodedToken, // 返回 Token，方便前端显示
          tokenExpiresIn: '24 hours'
        }
      });
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ ok: false, message: 'Export failed' });
    }
  }

  async downloadExport(req, res) {
    try {
      const { file, token } = req.query;
      
      if (!file || !token) {
        return res.status(400).json({ ok: false, message: 'File and token are required' });
      }

      // 通过 token 查找匹配的导出记录
      const allExports = exportModel.getAll();
      const exportRecord = allExports.find(e => e.exportToken === token && e.filename === file);
      if (!exportRecord) {
        return res.status(403).json({ ok: false, message: 'Invalid token or file' });
      }

      // Check if token expired
      if (exportRecord.tokenExpiresAt) {
        const now = new Date();
        const expiresAt = new Date(exportRecord.tokenExpiresAt);
        if (now > expiresAt) {
          return res.status(403).json({ ok: false, message: 'Token expired' });
        }
      }

      // Check download limit
      if (exportRecord.downloadCount >= exportRecord.maxDownloads) {
        return res.status(403).json({ ok: false, message: 'Download limit reached' });
      }

      // Check IP binding
      if (exportRecord.ipBinding && exportRecord.ipBinding !== req.ip) {
        return res.status(403).json({ ok: false, message: 'IP mismatch' });
      }

      // Increment download count
      exportModel.incrementDownloadCount(exportRecord.id);

      // Send file
      const filePath = path.join(__dirname, '../../data/exports', file);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ ok: false, message: 'File not found' });
      }

      res.setHeader('Content-Type', 'audio/x-mpegurl');
      res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
      res.sendFile(filePath);
    } catch (error) {
      console.error('Download error:', error);
      res.status(403).json({ ok: false, message: 'Invalid or expired token' });
    }
  }

  async listExports(req, res) {
    try {
      const exports = exportModel.getAll();
      res.json({ ok: true, data: exports });
    } catch (error) {
      console.error('List exports error:', error);
      res.status(500).json({ ok: false, message: 'Failed to list exports' });
    }
  }

  async deleteExport(req, res) {
    try {
      const { id } = req.params;
      // 订阅链接独立于导出文件，只通过文件名关联
      // 删除导出文件时不级联删除链接，链接变为空链接
      // 重新生成同名 m3u 文件后链接自动恢复有效
      const success = exportModel.delete(id);
      if (success) {
        res.json({ ok: true, message: 'Export deleted' });
      } else {
        res.status(404).json({ ok: false, message: 'Export not found' });
      }
    } catch (error) {
      console.error('Delete export error:', error);
      res.status(500).json({ ok: false, message: 'Failed to delete export' });
    }
  }

  async cleanupExpired(req, res) {
    try {
      exportModel.cleanupExpired();
      res.json({ ok: true, message: 'Cleanup completed' });
    } catch (error) {
      console.error('Cleanup error:', error);
      res.status(500).json({ ok: false, message: 'Cleanup failed' });
    }
  }

  async createLink(req, res) {
    try {
      const { exportId, username, description = '', expiresIn = 24, maxDownloads = 5, ipBinding = false } = req.body;
      
      if (!exportId) {
        return res.status(400).json({ ok: false, message: 'Export ID is required' });
      }

      // Check if export exists
      const exportRecord = exportModel.getById(exportId);
      if (!exportRecord) {
        return res.status(404).json({ ok: false, message: 'Export not found' });
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + parseInt(expiresIn));

      // 订阅模式下 maxDownloads=0 表示不限制
      // Create link record
      const linkRecord = linkModel.create({
        exportId,
        filename: exportRecord.filename,
        userId: req.user?.username || 'admin',
        username: username,
        description: description,
        expiresAt: expiresAt.toISOString(),
        maxDownloads,
        ipBinding: ipBinding ? req.ip : null
      });

      // Generate short link URL
      const shortLink = `${req.protocol}://${req.get('host')}/api/exports/link/${linkRecord.shortCode}`;

      res.json({
        ok: true,
        data: {
          linkId: linkRecord.id,
          shortCode: linkRecord.shortCode,
          shortLink: shortLink,
          expiresAt: linkRecord.expiresAt,
          maxDownloads,
          username
        }
      });
    } catch (error) {
      console.error('Create link error:', error);
      res.status(500).json({ ok: false, message: 'Create link failed' });
    }
  }

  async listLinks(req, res) {
    try {
      const links = linkModel.getAll();
      res.json({ ok: true, data: links });
    } catch (error) {
      console.error('List links error:', error);
      res.status(500).json({ ok: false, message: 'Failed to list links' });
    }
  }

  async deleteLink(req, res) {
    try {
      const { id } = req.params;
      const success = linkModel.delete(id);
      if (success) {
        res.json({ ok: true, message: 'Link deleted' });
      } else {
        res.status(404).json({ ok: false, message: 'Link not found' });
      }
    } catch (error) {
      console.error('Delete link error:', error);
      res.status(500).json({ ok: false, message: 'Failed to delete link' });
    }
  }

  async updateLink(req, res) {
    try {
      const { id } = req.params;
      const { username, description, expiresIn, maxDownloads, ipBinding, exportId } = req.body;
      
      if (!id) {
        return res.status(400).json({ ok: false, message: 'Link ID is required' });
      }

      // Check if link exists
      const linkRecord = linkModel.getById(id);
      if (!linkRecord) {
        return res.status(404).json({ ok: false, message: 'Link not found' });
      }

      // Prepare updates
      const updates = {};
      if (username !== undefined) updates.username = username;
      if (description !== undefined) updates.description = description;
      if (exportId !== undefined && exportId) {
        const exportRecord = exportModel.getById(exportId);
        if (!exportRecord) {
          return res.status(404).json({ ok: false, message: 'Export not found' });
        }
        updates.exportId = exportId;
        updates.filename = exportRecord.filename;
      }
      if (expiresIn !== undefined) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + parseInt(expiresIn));
        updates.expiresAt = expiresAt.toISOString();
      }
      if (maxDownloads !== undefined) updates.maxDownloads = parseInt(maxDownloads);
      if (ipBinding !== undefined) updates.ipBinding = ipBinding ? req.ip : null;

      // Update link
      const updatedLink = linkModel.update(id, updates);
      if (!updatedLink) {
        return res.status(404).json({ ok: false, message: 'Failed to update link' });
      }

      res.json({ ok: true, data: updatedLink });
    } catch (error) {
      console.error('Update link error:', error);
      res.status(500).json({ ok: false, message: 'Failed to update link' });
    }
  }

  async downloadByShortCode(req, res) {
    try {
      const { shortCode } = req.params;
      
      if (!shortCode) {
        return res.status(400).json({ ok: false, message: 'Short code is required' });
      }

      // Get link by short code
      const linkRecord = linkModel.getByShortCode(shortCode);
      if (!linkRecord) {
        return res.status(404).json({ ok: false, message: 'Link not found' });
      }

      // Check if expired
      const now = new Date();
      const expiresAt = new Date(linkRecord.expiresAt);
      if (now > expiresAt) {
        return res.status(403).json({ ok: false, message: 'Link expired' });
      }

      // Check download limit (0 = unlimited)
      if (linkRecord.maxDownloads > 0 && linkRecord.downloadCount >= linkRecord.maxDownloads) {
        return res.status(403).json({ ok: false, message: 'Download limit reached' });
      }

      // Check IP binding
      if (linkRecord.ipBinding && linkRecord.ipBinding !== req.ip) {
        return res.status(403).json({ ok: false, message: 'IP mismatch' });
      }

      // Increment download count
      linkModel.incrementDownloadCount(linkRecord.id);

      // Read M3U file content
      const filePath = path.resolve(__dirname, '../../data/exports', linkRecord.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ ok: false, message: 'File not found' });
      }

      let m3uContent = fs.readFileSync(filePath, 'utf8');

      // 生成 16 字符随机 auth token，有效期与链接剩余时间对齐
      const encodedToken = crypto.randomBytes(8).toString('hex');

      // 更新导出记录中的 token 和过期时间
      const linkRemainingMs = Math.max(0, new Date(linkRecord.expiresAt).getTime() - Date.now());
      const tokenExpiresAt = new Date(Date.now() + Math.min(linkRemainingMs + 5 * 60 * 1000, 24 * 3600 * 1000)).toISOString();
      const exportRecord = exportModel.getById(linkRecord.exportId);
      if (exportRecord) {
        exportModel.update(exportRecord.id, { exportToken: encodedToken, tokenExpiresAt });
      }

      // Add auth parameters to each URL in the M3U file
      console.log('[DownloadByShortCode] Original M3U content sample:', m3uContent.substring(0, 500));
      // 匹配完整代理 URL 和相对路径代理 URL
      m3uContent = m3uContent.replace(/(https?:\/\/[^\s]*\/m3u-proxy\?url=[^\s]*|\/m3u-proxy\?url=[^\s]*)/g, (match, url) => {
        console.log('[DownloadByShortCode] Processing URL:', url);
        
        // Check if URL already has auth parameters
        if (url.includes('auth_token=')) {
          console.log('[DownloadByShortCode] URL already has auth_token, skipping');
          return url;
        }
        
        // 相对路径补全为完整 URL
        let fullUrl = url;
        if (url.startsWith('/')) {
          const proto = req.headers['x-forwarded-proto'] || req.protocol;
          const host = req.headers['x-forwarded-host'] || req.get('host');
          fullUrl = `${proto}://${host}${url}`;
        }
        
        // Add auth parameters
        const separator = fullUrl.includes('?') ? '&' : '?';
        const newUrl = `${fullUrl}${separator}auth_token=${encodedToken}&link_id=${linkRecord.id}`;
        console.log('[DownloadByShortCode] New URL:', newUrl);
        return newUrl;
      });
      console.log('[DownloadByShortCode] Modified M3U content sample:', m3uContent.substring(0, 500));

      // Send modified M3U content
      res.setHeader('Content-Type', 'audio/x-mpegurl');
      res.setHeader('Content-Disposition', `attachment; filename="birdtv.m3u"`);
      res.send(m3uContent);
    } catch (error) {
      console.error('Download by short code error:', error);
      res.status(403).json({ ok: false, message: 'Invalid or expired link' });
    }
  }
}

module.exports = ExportController;
