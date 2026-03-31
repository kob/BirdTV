/**
 * 授权模块 - 基于Redis和JWT
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

let redisClient = null;
let jwtSecret = 'default-secret-change-in-production';
let tokenExpireDays = 7;
let authEnabled = false;

// Redis键前缀
const KEYS = {
  USER_PREFIX: 'auth:user:',
  TOKEN_PREFIX: 'auth:token:',
  ROLE_PREFIX: 'auth:role:',
  PERMISSION_PREFIX: 'auth:perm:'
};

// 默认角色
const DEFAULT_ROLES = {
  admin: { name: '管理员', permissions: ['*'] },
  user: { name: '普通用户', permissions: ['view', 'play'] },
  guest: { name: '访客', permissions: ['view'] }
};

/**
 * 初始化授权系统
 */
async function initAuth(config) {
  authEnabled = config.authEnabled === 'true';
  
  if (!authEnabled) {
    console.log('[Auth] 授权系统已禁用');
    return;
  }

  jwtSecret = config.jwtSecret || 'default-secret-change-in-production';
  tokenExpireDays = parseInt(config.tokenExpireDays) || 7;

  // 初始化Redis连接
  const Redis = require('redis');
  try {
    redisClient = Redis.createClient({
      socket: {
        host: config.redisHost || 'localhost',
        port: parseInt(config.redisPort) || 6379
      },
      password: config.redisPassword || undefined,
      database: parseInt(config.redisDb) || 0
    });

    await redisClient.connect();
    console.log('[Auth] Redis连接成功');

    // 初始化默认角色
    await initDefaultRoles();

    // 检查是否需要创建默认管理员
    const adminExists = await userExists(config.defaultAdmin || 'admin');
    if (!adminExists) {
      await createUser(
        config.defaultAdmin || 'admin',
        config.defaultPassword || 'admin123',
        'admin'
      );
      console.log('[Auth] 默认管理员账户已创建');
    }
  } catch (error) {
    console.error('[Auth] Redis连接失败:', error.message);
    console.log('[Auth] 将使用内存存储作为备用');
    // 备用内存存储
    useMemoryStorage();
  }
}

/**
 * 内存存储（当Redis不可用时使用）
 */
let memoryStorage = {
  users: new Map(),
  tokens: new Map(),
  roles: new Map()
};

function useMemoryStorage() {
  // 初始化默认角色
  Object.entries(DEFAULT_ROLES).forEach(([key, value]) => {
    memoryStorage.roles.set(key, JSON.stringify(value));
  });
}

/**
 * 初始化默认角色
 */
async function initDefaultRoles() {
  for (const [key, role] of Object.entries(DEFAULT_ROLES)) {
    await redisClient.setEx(
      KEYS.ROLE_PREFIX + key,
      86400 * 30,
      JSON.stringify(role)
    );
  }
}

/**
 * 生成JWT Token
 */
function generateToken(userId, username, role) {
  const now = Date.now();
  const payload = {
    userId,
    username,
    role,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + tokenExpireDays * 24 * 60 * 60 * 1000) / 1000)
  };

  // Base64编码 (简化版JWT，实际应用建议使用jsonwebtoken库)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${header}.${body}`)
    .digest('base64');

  return `${header}.${body}.${signature}`;
}

/**
 * 验证JWT Token
 */
function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = parts[0];
    const body = parts[1];
    const signature = parts[2];

    const expectedSignature = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64');

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64').toString());

    if (Date.now() / 1000 > payload.exp) {
      return null; // Token已过期
    }

    return payload;
  } catch (error) {
    console.error('[Auth] Token验证失败:', error.message);
    return null;
  }
}

/**
 * 创建用户
 */
async function createUser(username, password, role = 'user') {
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();

  const userData = {
    id: userId,
    username,
    passwordHash,
    role,
    createdAt: Date.now()
  };

  if (redisClient) {
    await redisClient.setEx(
      KEYS.USER_PREFIX + username,
      86400 * 365,
      JSON.stringify(userData)
    );
  } else {
    memoryStorage.users.set(username, JSON.stringify(userData));
  }

  return { userId, username, role };
}

/**
 * 验证用户登录
 */
async function verifyUser(username, password) {
  let userData;
  
  if (redisClient) {
    const data = await redisClient.get(KEYS.USER_PREFIX + username);
    if (!data) return null;
    userData = JSON.parse(data);
  } else {
    const data = memoryStorage.users.get(username);
    if (!data) return null;
    userData = JSON.parse(data);
  }

  const isValid = await bcrypt.compare(password, userData.passwordHash);
  if (!isValid) return null;

  // 生成token
  const token = generateToken(userData.id, userData.username, userData.role);

  // 存储token
  if (redisClient) {
    await redisClient.setEx(
      KEYS.TOKEN_PREFIX + token,
      tokenExpireDays * 86400,
      JSON.stringify({ userId: userData.id, username: userData.username })
    );
  } else {
    memoryStorage.tokens.set(token, JSON.stringify({ userId: userData.id, username: userData.username }));
  }

  return {
    token,
    user: {
      id: userData.id,
      username: userData.username,
      role: userData.role
    }
  };
}

/**
 * 检查用户是否存在
 */
async function userExists(username) {
  if (redisClient) {
    return await redisClient.exists(KEYS.USER_PREFIX + username) === 1;
  } else {
    return memoryStorage.users.has(username);
  }
}

/**
 * 检查token是否有效
 */
async function isTokenValid(token) {
  if (!token) return false;

  const payload = verifyToken(token);
  if (!payload) return false;

  if (redisClient) {
    const exists = await redisClient.exists(KEYS.TOKEN_PREFIX + token) === 1;
    return exists;
  } else {
    return memoryStorage.tokens.has(token);
  }
}

/**
 * 登出
 */
async function logout(token) {
  if (redisClient) {
    await redisClient.del(KEYS.TOKEN_PREFIX + token);
  } else {
    memoryStorage.tokens.delete(token);
  }
}

/**
 * 检查权限
 */
async function hasPermission(token, permission) {
  if (!authEnabled) return true;

  const payload = verifyToken(token);
  if (!payload) return false;

  if (redisClient) {
    const roleData = await redisClient.get(KEYS.ROLE_PREFIX + payload.role);
    if (!roleData) return false;
    const role = JSON.parse(roleData);
    return role.permissions.includes('*') || role.permissions.includes(permission);
  } else {
    const roleData = memoryStorage.roles.get(payload.role);
    if (!roleData) return false;
    const role = JSON.parse(roleData);
    return role.permissions.includes('*') || role.permissions.includes(permission);
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo(token) {
  const payload = verifyToken(token);
  if (!payload) return null;

  return {
    id: payload.userId,
    username: payload.username,
    role: payload.role
  };
}

/**
 * 授权中间件
 */
function authMiddleware(requiredPermission = null) {
  return async (req, res, next) => {
    if (!authEnabled) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: '未提供认证令牌'
      });
    }

    const isValid = await isTokenValid(token);
    if (!isValid) {
      return res.status(401).json({
        ok: false,
        error: 'invalid_token',
        message: '无效或已过期的令牌'
      });
    }

    if (requiredPermission) {
      const hasPerm = await hasPermission(token, requiredPermission);
      if (!hasPerm) {
        return res.status(403).json({
          ok: false,
          error: 'forbidden',
          message: '权限不足'
        });
      }
    }

    // 将用户信息附加到请求对象
    req.user = await getUserInfo(token);
    next();
  };
}

/**
 * 关闭授权系统
 */
async function closeAuth() {
  if (redisClient) {
    await redisClient.quit();
  }
}

/**
 * 列出所有用户（管理员功能）
 */
async function listUsers() {
  const users = [];

  if (redisClient) {
    // 从 Redis 获取所有用户键
    const keys = await redisClient.keys(KEYS.USER_PREFIX + '*');
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const userData = JSON.parse(data);
        users.push({
          id: userData.id,
          username: userData.username,
          role: userData.role,
          createdAt: userData.createdAt
        });
      }
    }
  } else {
    // 从内存存储获取
    for (const [username, data] of memoryStorage.users.entries()) {
      const userData = JSON.parse(data);
      users.push({
        id: userData.id,
        username: userData.username,
        role: userData.role,
        createdAt: userData.createdAt
      });
    }
  }

  return users;
}

/**
 * 更新用户信息（管理员功能）
 */
async function updateUser(userId, data) {
  const { password, role } = data;
  let targetUser = null;
  let targetUsername = null;

  // 查找用户
  if (redisClient) {
    const keys = await redisClient.keys(KEYS.USER_PREFIX + '*');
    for (const key of keys) {
      const userData = await redisClient.get(key);
      if (userData) {
        const user = JSON.parse(userData);
        if (user.id === userId) {
          targetUser = user;
          targetUsername = user.username;
          break;
        }
      }
    }
  } else {
    for (const [username, dataStr] of memoryStorage.users.entries()) {
      const user = JSON.parse(dataStr);
      if (user.id === userId) {
        targetUser = user;
        targetUsername = username;
        break;
      }
    }
  }

  if (!targetUser) {
    return null;
  }

  // 更新密码
  if (password) {
    targetUser.passwordHash = await bcrypt.hash(password, 10);
  }

  // 更新角色
  if (role) {
    targetUser.role = role;
  }

  targetUser.updatedAt = Date.now();

  // 保存更新
  if (redisClient) {
    await redisClient.setEx(
      KEYS.USER_PREFIX + targetUsername,
      86400 * 365,
      JSON.stringify(targetUser)
    );
  } else {
    memoryStorage.users.set(targetUsername, JSON.stringify(targetUser));
  }

  // 删除该用户的所有 token（强制重新登录）
  if (redisClient) {
    const tokenKeys = await redisClient.keys(KEYS.TOKEN_PREFIX + '*');
    for (const tokenKey of tokenKeys) {
      const tokenData = await redisClient.get(tokenKey);
      if (tokenData) {
        const tokenInfo = JSON.parse(tokenData);
        if (tokenInfo.userId === userId) {
          await redisClient.del(tokenKey);
        }
      }
    }
  } else {
    for (const [token, tokenData] of memoryStorage.tokens.entries()) {
      const info = JSON.parse(tokenData);
      if (info.userId === userId) {
        memoryStorage.tokens.delete(token);
      }
    }
  }

  return {
    id: targetUser.id,
    username: targetUser.username,
    role: targetUser.role,
    updatedAt: targetUser.updatedAt
  };
}

/**
 * 删除用户（管理员功能）
 */
async function deleteUser(userId) {
  let targetUsername = null;

  // 查找并删除用户
  if (redisClient) {
    const keys = await redisClient.keys(KEYS.USER_PREFIX + '*');
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const user = JSON.parse(data);
        if (user.id === userId) {
          targetUsername = user.username;
          await redisClient.del(key);
          break;
        }
      }
    }
  } else {
    for (const [username, dataStr] of memoryStorage.users.entries()) {
      const user = JSON.parse(dataStr);
      if (user.id === userId) {
        targetUsername = username;
        memoryStorage.users.delete(username);
        break;
      }
    }
  }

  if (!targetUsername) {
    return false;
  }

  // 删除该用户的所有 token
  if (redisClient) {
    const tokenKeys = await redisClient.keys(KEYS.TOKEN_PREFIX + '*');
    for (const tokenKey of tokenKeys) {
      const tokenData = await redisClient.get(tokenKey);
      if (tokenData) {
        const tokenInfo = JSON.parse(tokenData);
        if (tokenInfo.userId === userId) {
          await redisClient.del(tokenKey);
        }
      }
    }
  } else {
    for (const [token, tokenData] of memoryStorage.tokens.entries()) {
      const info = JSON.parse(tokenData);
      if (info.userId === userId) {
        memoryStorage.tokens.delete(token);
      }
    }
  }

  return true;
}

/**
 * 修改密码
 */
async function changePassword(username, newPassword) {
  let userData = null;

  // 查找用户
  if (redisClient) {
    const data = await redisClient.get(KEYS.USER_PREFIX + username);
    if (data) {
      userData = JSON.parse(data);
    }
  } else {
    const data = memoryStorage.users.get(username);
    if (data) {
      userData = JSON.parse(data);
    }
  }

  if (!userData) {
    return false;
  }

  // 更新密码
  userData.passwordHash = await bcrypt.hash(newPassword, 10);
  userData.updatedAt = Date.now();

  // 保存更新
  if (redisClient) {
    await redisClient.setEx(
      KEYS.USER_PREFIX + username,
      86400 * 365,
      JSON.stringify(userData)
    );
  } else {
    memoryStorage.users.set(username, JSON.stringify(userData));
  }

  // 删除该用户的所有 token（强制重新登录）
  if (redisClient) {
    const tokenKeys = await redisClient.keys(KEYS.TOKEN_PREFIX + '*');
    for (const tokenKey of tokenKeys) {
      const tokenData = await redisClient.get(tokenKey);
      if (tokenData) {
        const tokenInfo = JSON.parse(tokenData);
        if (tokenInfo.userId === userData.id) {
          await redisClient.del(tokenKey);
        }
      }
    }
  } else {
    for (const [token, tokenData] of memoryStorage.tokens.entries()) {
      const info = JSON.parse(tokenData);
      if (info.userId === userData.id) {
        memoryStorage.tokens.delete(token);
      }
    }
  }

  return true;
}

module.exports = {
  initAuth,
  closeAuth,
  createUser,
  verifyUser,
  verifyToken,
  logout,
  isTokenValid,
  hasPermission,
  getUserInfo,
  authMiddleware,
  listUsers,
  updateUser,
  deleteUser,
  changePassword,
  isEnabled: () => authEnabled
};
