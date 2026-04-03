const fs = require('fs');
const path = require('path');

class Link {
  constructor() {
    this.linkFile = path.resolve(__dirname, '../../data/links.json');
    this._ensureFile();
  }

  _ensureFile() {
    try {
      if (!fs.existsSync(this.linkFile)) {
        console.log(`Creating links.json file at: ${this.linkFile}`);
        const baseDir = path.dirname(this.linkFile);
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }
        fs.writeFileSync(this.linkFile, JSON.stringify([], null, 2));
        console.log('links.json file created successfully');
      }
    } catch (error) {
      console.error('Failed to create links.json file:', error);
    }
  }

  getAll() {
    try {
      const data = fs.readFileSync(this.linkFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read links:', error);
      return [];
    }
  }

  getById(id) {
    const links = this.getAll();
    return links.find(e => e.id === id);
  }

  getByShortCode(shortCode) {
    const links = this.getAll();
    return links.find(e => e.shortCode === shortCode);
  }

  getByUsername(username) {
    const links = this.getAll();
    return links.find(e => e.username === username);
  }

  generateSubCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 24; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  create(data) {
    const links = this.getAll();
    let shortCode;
    if (data.username) {
      // 如果关联了用户，检查是否已有订阅，有则更新
      const existing = this.getByUsername(data.username);
      if (existing) {
        this.update(existing.id, {
          exportId: data.exportId,
          filename: data.filename,
          description: data.description || existing.description,
          expiresAt: data.expiresAt,
          maxDownloads: data.maxDownloads || existing.maxDownloads,
          ipBinding: data.ipBinding || existing.ipBinding
        });
        return this.getById(existing.id);
      }
    }
    do {
      shortCode = this.generateSubCode();
    } while (this.getAll().some(link => link.shortCode === shortCode));

    const newLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      shortCode: shortCode,
      exportId: data.exportId,
      filename: data.filename,
      userId: data.userId || 'admin',
      username: data.username || '',
      description: data.description || '',
      createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt,
      maxDownloads: data.maxDownloads || 5,
      downloadCount: 0,
      ipBinding: data.ipBinding || null
    };
    links.push(newLink);
    this._save(links);
    return newLink;
  }

  update(id, updates) {
    const links = this.getAll();
    const index = links.findIndex(e => e.id === id);
    if (index === -1) return null;
    links[index] = { ...links[index], ...updates };
    this._save(links);
    return links[index];
  }

  delete(id) {
    const links = this.getAll();
    const index = links.findIndex(e => e.id === id);
    if (index === -1) return false;
    links.splice(index, 1);
    this._save(links);
    return true;
  }

  incrementDownloadCount(id) {
    const link = this.getById(id);
    if (!link) return null;
    
    const updated = this.update(id, {
      downloadCount: link.downloadCount + 1
    });
    return updated;
  }

  _save(data) {
    try {
      fs.writeFileSync(this.linkFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save links:', error);
    }
  }

  cleanupExpired() {
    const links = this.getAll();
    const now = new Date();
    const validLinks = links.filter(e => {
      const expiresAt = new Date(e.expiresAt);
      return expiresAt > now;
    });
    this._save(validLinks);
  }
}

module.exports = new Link();