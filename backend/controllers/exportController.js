const fs = require('fs');
const path = require('path');
const exportModel = require('../models/Export');
const linkModel = require('../models/Link');
const tokenService = require('../services/tokenService');

class ExportController {
  constructor(storage) {
    this.storage = storage;
  }

  async exportChannels(req, res) {
    try {
      const { channelIds, description = '', useShortLink = false } = req.body;
      
      if (!channelIds || !Array.isArray(channelIds)) {
        return res.status(400).json({ ok: false, message: 'Channel IDs are required' });
      }

      // Get selected channels
      const allChannels = await this.storage.getChannels();
      const channels = allChannels.filter(channel => channelIds.includes(channel.id));
      if (!channels.length) {
        return res.status(400).json({ ok: false, message: 'No channels found' });
      }

      // 生成长期有效的导出 Token（1 年有效期）
      const exportToken = tokenService.generateToken({
        type: 'export',
        userId: req.user?.username || 'admin',
        ttl: 365 * 24 * 3600 * 1000 // 365 days
      });
      const encodedToken = tokenService.encodeToken(exportToken);
      
      // 获取当前服务器地址
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${protocol}://${host}`;

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

          if (channel.drm && channel.drm.clearKeys) {
            m3uContent += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
            m3uContent += '#KODIPROP:inputstream.adaptive.license_type=clearkey\n';
            const firstKey = Object.entries(channel.drm.clearKeys)[0];
            if (firstKey) {
              const [kid, key] = firstKey;
              m3uContent += `#KODIPROP:inputstream.adaptive.license_key=${kid}:${key}\n`;
            }
          }
          tempM3uContent += `${channel.url}\n`;
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
          tokenExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
        });
        
        // 创建短链接
        const linkRecord = linkModel.create({
          exportId,
          filename,
          userId: req.user?.username || 'admin',
          username: 'export',
          description: description,
          expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
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
          // 传统模式：为代理 URL 添加 auth_token
          let finalUrl = channel.url;
          if (finalUrl.includes('/m3u-proxy') || finalUrl.includes('/stream/proxy')) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${separator}auth_token=${encodedToken}`;
          }
          m3uContent += `${finalUrl}\n`;
        }
      });

      // Generate export ID and filename
      const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const filename = `${exportId}.m3u`;
      // 使用绝对路径
      const exportDir = path.resolve(__dirname, '../../data/exports');
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
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() // 1 year
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
          tokenExpiresIn: '365 days'
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

      // Verify token
      const decodedToken = tokenService.decodeToken(token);
      tokenService.verifyToken(decodedToken);

      // Check if export exists
      const exportRecord = exportModel.getById(decodedToken.exportId);
      if (!exportRecord) {
        return res.status(404).json({ ok: false, message: 'Export not found' });
      }

      // Check if file matches
      if (exportRecord.filename !== file) {
        return res.status(400).json({ ok: false, message: 'Invalid file' });
      }

      // Check if expired
      const now = new Date();
      const expiresAt = new Date(exportRecord.expiresAt);
      if (now > expiresAt) {
        return res.status(403).json({ ok: false, message: 'Export expired' });
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
      const { username, description, expiresIn, maxDownloads, ipBinding } = req.body;
      
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

      // Check download limit
      if (linkRecord.downloadCount >= linkRecord.maxDownloads) {
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

      // Generate auth token for the link
      const authToken = tokenService.generateToken({
        linkId: linkRecord.id,
        shortCode: linkRecord.shortCode,
        ip: req.ip,
        ttl: 24 * 3600 * 1000 // 24 hours
      });
      const encodedToken = tokenService.encodeToken(authToken);

      // Add auth parameters to each URL in the M3U file
      console.log('[DownloadByShortCode] Original M3U content sample:', m3uContent.substring(0, 500));
      // 使用更通用的正则表达式匹配代理 URL，支持 http 和 https，支持任何主机名
      m3uContent = m3uContent.replace(/(https?:\/\/[^\s]*\/m3u-proxy\?url=[^\s]*)/g, (match, url) => {
        console.log('[DownloadByShortCode] Processing URL:', url);
        
        let processedUrl = url;
        
        try {
          // 解析 URL 参数
          const urlObj = new URL(url);
          const originalUrl = urlObj.searchParams.get('url');
          
          if (originalUrl) {
            // 清理原始 URL 中的 token 参数（避免冲突）
            const cleanOriginalUrl = originalUrl.replace(/[?&](token|auth|key|secret|sig|signature)=[^&]*/gi, '');
            console.log('[DownloadByShortCode] Cleaned original URL:', cleanOriginalUrl);
            
            // 重新构建 BirdTV 代理 URL
            urlObj.searchParams.set('url', cleanOriginalUrl);
            
            // 移除旧的 auth_token 和 link_id
            urlObj.searchParams.delete('auth_token');
            urlObj.searchParams.delete('link_id');
            
            // 使用处理后的 URL
            processedUrl = urlObj.toString();
            console.log('[DownloadByShortCode] Processed URL:', processedUrl);
          }
        } catch (e) {
          console.log('[DownloadByShortCode] URL parse error:', e.message);
        }
        
        // Add auth parameters to processed URL
        const separator = processedUrl.includes('?') ? '&' : '?';
        const newUrl = `${processedUrl}${separator}auth_token=${encodedToken}&link_id=${linkRecord.id}`;
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
