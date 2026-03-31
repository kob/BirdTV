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
      const { channelIds, description = '' } = req.body;
      
      if (!channelIds || !Array.isArray(channelIds)) {
        return res.status(400).json({ ok: false, message: 'Channel IDs are required' });
      }

      // Get selected channels
      const allChannels = await this.storage.getChannels();
      const channels = allChannels.filter(channel => channelIds.includes(channel.id));
      if (!channels.length) {
        return res.status(400).json({ ok: false, message: 'No channels found' });
      }

      // Generate M3U content (完整格式，包含DRM信息和原始URL)
      let m3uContent = '#EXTM3U\n';
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

        // 添加KODIPROP信息（如果有DRM）
        if (channel.drm && channel.drm.clearKeys) {
          m3uContent += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
          m3uContent += '#KODIPROP:inputstream.adaptive.license_type=clearkey\n';
          // 提取第一个clearKey
          const firstKey = Object.entries(channel.drm.clearKeys)[0];
          if (firstKey) {
            const [kid, key] = firstKey;
            m3uContent += `#KODIPROP:inputstream.adaptive.license_key=${kid}:${key}\n`;
          }
        }

        // 保留原始URL中的鉴权信息，不添加新的鉴权参数
        // 只使用原始URL，不做任何参数清理
        const cleanUrl = channel.url;
        m3uContent += `${cleanUrl}\n`;
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
        fileSize
      });

      res.json({
        ok: true,
        data: {
          exportId,
          filename,
          fileSize,
          description
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
        
        // Check if URL already has auth parameters
        if (url.includes('auth_token=')) {
          console.log('[DownloadByShortCode] URL already has auth_token, skipping');
          return url;
        }
        
        // Add auth parameters
        const separator = url.includes('?') ? '&' : '?';
        const newUrl = `${url}${separator}auth_token=${encodedToken}&link_id=${linkRecord.id}`;
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
