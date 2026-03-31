const crypto = require('crypto');

const SECRET_KEY = process.env.SECRET_KEY || 'birdtv-secret-key-2024';

class TokenService {
  generateToken(payload) {
    const exp = Date.now() + (payload.ttl || 24 * 3600 * 1000);
    const data = {
      ...payload,
      exp
    };
    
    const sig = this._generateSignature(data);
    return {
      ...data,
      sig
    };
  }

  verifyToken(token) {
    if (!token) {
      throw new Error('No token provided');
    }

    // 检查过期
    if (Date.now() > token.exp) {
      throw new Error('Token expired');
    }

    // 验证签名
    const { sig, ...payload } = token;
    const expectedSig = this._generateSignature(payload);
    if (sig !== expectedSig) {
      throw new Error('Invalid token signature');
    }

    return payload;
  }

  _generateSignature(data) {
    const str = JSON.stringify(data) + SECRET_KEY;
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  encodeToken(token) {
    return Buffer.from(JSON.stringify(token)).toString('base64');
  }

  decodeToken(encodedToken) {
    try {
      const json = Buffer.from(encodedToken, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid token format');
    }
  }
}

module.exports = new TokenService();
