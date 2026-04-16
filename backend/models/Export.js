const fs = require('fs');
const path = require('path');

class Export {
  constructor() {
    // 使用绝对路径
    this.baseDir = path.resolve(__dirname, '../../data');
    this.exportDir = path.join(this.baseDir, 'exports');
    this.exportFile = path.join(this.baseDir, 'exports.json');
    console.log(`Export model initialized with:`);
    console.log(`  Base directory: ${this.baseDir}`);
    console.log(`  Export directory: ${this.exportDir}`);
    console.log(`  Export file: ${this.exportFile}`);
    this._ensureDir();
    this._ensureFile();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.exportDir)) {
        console.log(`Creating export directory at: ${this.exportDir}`);
        fs.mkdirSync(this.exportDir, { recursive: true });
        console.log('Export directory created successfully');
      } else {
        console.log('Export directory already exists');
      }
    } catch (error) {
      console.error('Failed to create export directory:', error);
    }
  }

  _ensureFile() {
    try {
      if (!fs.existsSync(this.exportFile)) {
        console.log(`Creating exports.json file at: ${this.exportFile}`);
        // 确保data目录存在
        if (!fs.existsSync(this.baseDir)) {
          console.log(`Creating data directory at: ${this.baseDir}`);
          fs.mkdirSync(this.baseDir, { recursive: true });
        }
        fs.writeFileSync(this.exportFile, JSON.stringify([], null, 2));
        console.log('exports.json file created successfully');
      } else {
        console.log('exports.json file already exists');
      }
    } catch (error) {
      console.error('Failed to create exports.json file:', error);
      // 尝试使用当前工作目录作为备选
      try {
        const fallbackFile = path.join(process.cwd(), 'data', 'exports.json');
        console.log(`Trying fallback path: ${fallbackFile}`);
        const fallbackDir = path.dirname(fallbackFile);
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        fs.writeFileSync(fallbackFile, JSON.stringify([], null, 2));
        console.log('Fallback exports.json file created successfully');
        this.exportFile = fallbackFile;
        this.exportDir = path.join(path.dirname(fallbackFile), 'exports');
      } catch (fallbackError) {
        console.error('Failed to create fallback exports.json file:', fallbackError);
      }
    }
  }

  getAll() {
    try {
      const data = fs.readFileSync(this.exportFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read exports:', error);
      return [];
    }
  }

  getById(id) {
    const exports = this.getAll();
    return exports.find(e => e.id === id);
  }

  create(data) {
    const exports = this.getAll();
    const newExport = {
      id: data.id,
      filename: data.filename,
      userId: data.userId || 'admin',
      description: data.description || '',
      createdAt: new Date().toISOString(),
      fileSize: data.fileSize || 0,
      exportToken: data.exportToken || '',
      tokenExpiresAt: data.tokenExpiresAt || ''
    };
    exports.push(newExport);
    this._save(exports);
    return newExport;
  }

  update(id, updates) {
    const exports = this.getAll();
    const index = exports.findIndex(e => e.id === id);
    if (index === -1) return null;
    exports[index] = { ...exports[index], ...updates };
    this._save(exports);
    return exports[index];
  }

  deleteRecordOnly(id) {
    const exports = this.getAll();
    const index = exports.findIndex(e => e.id === id);
    if (index === -1) return false;
    exports.splice(index, 1);
    this._save(exports);
    return true;
  }

  delete(id) {
    const exports = this.getAll();
    const index = exports.findIndex(e => e.id === id);
    if (index === -1) return false;
    
    // Delete the file
    const exportData = exports[index];
    const filePath = path.join(this.exportDir, exportData.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Remove from list
    exports.splice(index, 1);
    try {
      this._save(exports);
      return true;
    } catch (error) {
      console.error('Failed to delete export:', error);
      return false;
    }
  }

  incrementDownloadCount(id) {
    const exportData = this.getById(id);
    if (!exportData) return null;
    
    const updated = this.update(id, {
      downloadCount: exportData.downloadCount + 1
    });
    return updated;
  }

  _save(data) {
    try {
      fs.writeFileSync(this.exportFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save exports:', error);
    }
  }

  cleanupExpired() {
    const exports = this.getAll();
    const now = new Date();
    const validExports = exports.filter(e => {
      const expiresAt = new Date(e.expiresAt);
      if (expiresAt < now) {
        // Delete expired file
        const filePath = path.join(this.exportDir, e.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return false;
      }
      return true;
    });
    this._save(validExports);
  }
}

module.exports = new Export();
