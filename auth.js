/**
 * 授权模块 - 基于Redis和JWT
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

let redisClient = null;
let jwtSecret = 'default-secret-change-in-production';
let tokenExpireDays = 7;
let authEnabled = false;
let redisReady = false;
let redisConfig = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// 内存存储持久化文件路径
let memoryStorageFile = null;

// Redis键前缀（支持环境变量配置多实例隔离）
const _redisPrefix = process.env.REDIS_PREFIX || 'birdtv';
const _systemId = process.env.BIRDTV_SYSTEM_ID || 'default';
const _authPrefix = `${_redisPrefix}:${_systemId}:auth:`;
const KEYS = {
  USER_PREFIX: _authPrefix + 'user:',
  TOKEN_PREFIX: _authPrefix + 'token:',
  ROLE_PREFIX: _authPrefix + 'role:',
  PERMISSION_PREFIX: _authPrefix + 'perm:'
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

  console.log(`[Auth] Redis 认证 key 前缀: ${_authPrefix} (REDIS_PREFIX=${_redisPrefix}, BIRDTV_SYSTEM_ID=${_systemId})`);
  jwtSecret = config.jwtSecret || 'default-secret-change-in-production';
  tokenExpireDays = parseInt(config.tokenExpireDays) || 7;

  // 设置内存存储持久化文件路径
  if (config.dataDir) {
    memoryStorageFile = path.join(config.dataDir, 'auth-storage.json');
  }

  // 初始化Redis连接
  const Redis = require('redis');

  // 只有当redisHost不为空时才尝试连接Redis
  if (config.redisHost) {
    redisConfig = {
      host: config.redisHost,
      port: parseInt(config.redisPort) || 6379,
      password: config.redisPassword || undefined,
      database: parseInt(config.redisDb) || 0
    };

    try {
      redisClient = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          reconnectStrategy: false
        },
        password: redisConfig.password,
        database: redisConfig.database
      });

      // 注册事件处理器，捕获运行时断连
      redisClient.on('error', (err) => {
        console.warn('[Auth] Redis 运行时异常:', err.message);
        redisReady = false;
      });

      redisClient.on('end', () => {
        console.warn('[Auth] Redis 连接已断开');
        redisReady = false;
        _scheduleReconnect();
      });

      await redisClient.connect();
      redisReady = true;
      console.log('[Auth] Redis连接成功');

      // 初始化默认角色
      await initDefaultRoles();

      // 检查是否需要创建默认管理员
      const adminExists = await userExists(config.defaultAdmin || 'admin');
      if (!adminExists) {
        await createUser(
          config.defaultAdmin || 'admin',
          config.defaultPassword || 'admin123',
          'admin',
          true
        );
        console.log('[Auth] 默认管理员账户已创建');
      }
    } catch (error) {
      console.error('[Auth] Redis连接失败:', error.message);
      console.log('[Auth] 将使用内存存储作为备用');
      console.log('[Auth] 内存存储持久化文件:', memoryStorageFile);
      // 备用内存存储
      useMemoryStorage();

      // 尝试从文件加载内存存储数据
      loadMemoryStorageFromFile();

      // 检查是否需要创建默认管理员
      const adminExists = memoryStorage.users.has(config.defaultAdmin || 'admin');
      if (!adminExists) {
        const passwordHash = bcrypt.hashSync(config.defaultPassword || 'admin123', 10);
        const userId = crypto.randomUUID();

        const userData = {
          id: userId,
          username: config.defaultAdmin || 'admin',
          passwordHash,
          role: 'admin',
          createdAt: Date.now(),
          isDefaultPassword: true
        };

        memoryStorage.users.set(config.defaultAdmin || 'admin', JSON.stringify(userData));
        saveMemoryStorageToFile(); // 保存到文件
        console.log('[Auth] 默认管理员账户已创建（内存存储）');
      } else {
        console.log('[Auth] 管理员账户已存在（从文件加载）');
      }

      // 尝试后台重连
      _scheduleReconnect();
    }
  } else {
    // 当redisHost为空时，直接使用内存存储
    console.log('[Auth] Redis未配置，将使用内存存储');
    console.log('[Auth] 内存存储持久化文件:', memoryStorageFile);
    useMemoryStorage();

    // 尝试从文件加载内存存储数据
    loadMemoryStorageFromFile();

    // 检查是否需要创建默认管理员
    const adminExists = memoryStorage.users.has(config.defaultAdmin || 'admin');
    if (!adminExists) {
      const passwordHash = bcrypt.hashSync(config.defaultPassword || 'admin123', 10);
      const userId = crypto.randomUUID();

      const userData = {
        id: userId,
        username: config.defaultAdmin || 'admin',
        passwordHash,
        role: 'admin',
        createdAt: Date.now(),
        isDefaultPassword: true
      };

      memoryStorage.users.set(config.defaultAdmin || 'admin', JSON.stringify(userData));
      saveMemoryStorageToFile(); // 保存到文件
      console.log('[Auth] 默认管理员账户已创建（内存存储）');
    } else {
      console.log('[Auth] 管理员账户已存在（从文件加载）');
    }
  }
}

/**
 * 内存存储（当Redis不可用时使用）
 * 支持文件持久化，防止服务重启后数据丢失
 */
let memoryStorage = {
  users: new Map(),
  tokens: new Map(),
  roles: new Map()
};

/**
 * 从文件加载内存存储数据
 */
function loadMemoryStorageFromFile() {
  if (!memoryStorageFile) {
    return;
  }

  try {
    if (fs.existsSync(memoryStorageFile)) {
      const data = fs.readFileSync(memoryStorageFile, 'utf-8');
      const parsed = JSON.parse(data);
      memoryStorage.users = new Map(Object.entries(parsed.users || {}));
      memoryStorage.tokens = new Map(Object.entries(parsed.tokens || {}));
      memoryStorage.roles = new Map(Object.entries(parsed.roles || {}));
      console.log('[Auth] 内存存储数据已从文件加载:', memoryStorageFile);
    }
  } catch (error) {
    console.error('[Auth] 从文件加载内存存储失败:', error.message);
    // 加载失败时初始化为空 Map
    memoryStorage.users = new Map();
    memoryStorage.tokens = new Map();
    memoryStorage.roles = new Map();
  }
}

/**
 * 将内存存储数据保存到文件
 */
function saveMemoryStorageToFile() {
  if (!memoryStorageFile) {
    return;
  }

  try {
    // 确保目录存在
    const dir = path.dirname(memoryStorageFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      users: Object.fromEntries(memoryStorage.users),
      tokens: Object.fromEntries(memoryStorage.tokens),
      roles: Object.fromEntries(memoryStorage.roles)
    };
    fs.writeFileSync(memoryStorageFile, JSON.stringify(data, null, 2));
    console.log('[Auth] 内存存储数据已保存到文件:', memoryStorageFile);
  } catch (error) {
    console.error('[Auth] 保存内存存储到文件失败:', error.message);
  }
}

function useMemoryStorage() {
  // 初始化默认角色
  Object.entries(DEFAULT_ROLES).forEach(([key, value]) => {
    memoryStorage.roles.set(key, JSON.stringify(value));
  });
}

/**
 * Redis 自动重连（指数退避）
 */
function _scheduleReconnect(attempt) {
  if (!redisConfig) return;
  attempt = attempt || 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    console.warn('[Auth] Redis 重连次数超限，继续使用内存存储');
    return;
  }
  if (reconnectTimer) return; // 已有重连任务

  reconnectAttempt = attempt;
  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  console.log(`[Auth] ${delay/1000}秒后尝试第${attempt}次 Redis 重连...`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await _attemptReconnect(attempt);
  }, delay);
}

async function _attemptReconnect(attempt) {
  if (!redisConfig) return;

  try {
    const Redis = require('redis');
    // 确保旧连接已关闭
    if (redisClient) {
      try { await redisClient.quit(); } catch {}
    }

    redisClient = Redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        reconnectStrategy: false
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    redisClient.on('error', (err) => {
      console.warn('[Auth] Redis 运行时异常:', err.message);
      redisReady = false;
    });

    redisClient.on('end', () => {
      console.warn('[Auth] Redis 连接已断开');
      redisReady = false;
      _scheduleReconnect(reconnectAttempt + 1);
    });

    await redisClient.connect();
    redisReady = true;
    reconnectAttempt = 0;
    console.log('[Auth] Redis 重连成功!');
  } catch (error) {
    console.warn(`[Auth] Redis 第${attempt}次重连失败:`, error.message);
    _scheduleReconnect(attempt + 1);
  }
}

/**
 * 安全执行 Redis 操作，失败时自动降级到内存存储
 * @param {Function} redisFn - 执行 Redis 操作的函数
 * @param {Function} memoryFn - 降级内存操作的函数
 * @returns {*} 操作结果
 */
async function _redisSafe(redisFn, memoryFn) {
  // 优先使用 Redis
  if (redisReady && redisClient && redisClient.isOpen) {
    try {
      return await redisFn();
    } catch (error) {
      console.warn('[Auth] Redis 操作失败:', error.message);
      redisReady = false;
      // 触发重连
      _scheduleReconnect();
    }
  }
  // 降级到内存存储
  if (memoryFn) {
    return await memoryFn();
  }
  return null;
}

/**
 * 初始化默认角色
 */
async function initDefaultRoles() {
  for (const [key, role] of Object.entries(DEFAULT_ROLES)) {
    try {
      await _redisSafe(
        () => redisClient.setEx(KEYS.ROLE_PREFIX + key, 86400 * 30, JSON.stringify(role)),
        () => { memoryStorage.roles.set(key, JSON.stringify(role)); }
      );
    } catch (error) {
      console.warn('[Auth] 初始化默认角色失败:', error.message);
    }
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
async function createUser(username, password, role = 'user', isDefaultPassword = false) {
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();

  const userData = {
    id: userId,
    username,
    passwordHash,
    role,
    createdAt: Date.now(),
    isDefaultPassword: isDefaultPassword
  };

  if (redisClient) {
    try {
      await redisClient.setEx(
        KEYS.USER_PREFIX + username,
        86400 * 365,
        JSON.stringify(userData)
      );
    } catch (error) {
      console.warn('[Auth] Redis 创建用户失败，降级到内存存储:', error.message);
      redisReady = false;
      _scheduleReconnect();
      memoryStorage.users.set(username, JSON.stringify(userData));
      saveMemoryStorageToFile();
    }
  } else {
    memoryStorage.users.set(username, JSON.stringify(userData));
    saveMemoryStorageToFile(); // 保存到文件
  }

  return { userId, username, role };
}

/**
 * 验证用户登录
 */
async function verifyUser(username, password) {
  let userData;
  
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      const data = await redisClient.get(KEYS.USER_PREFIX + username);
      if (!data) return null;
      userData = JSON.parse(data);
    } else {
      const data = memoryStorage.users.get(username);
      if (!data) return null;
      userData = JSON.parse(data);
    }
  } catch (error) {
    console.warn('[Auth] Redis verifyUser 读取失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
    const data = memoryStorage.users.get(username);
    if (!data) return null;
    userData = JSON.parse(data);
  }

  const isValid = await bcrypt.compare(password, userData.passwordHash);
  if (!isValid) return null;

  // 生成token
  const token = generateToken(userData.id, userData.username, userData.role);

  // 存储token
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      await redisClient.setEx(
        KEYS.TOKEN_PREFIX + token,
        tokenExpireDays * 86400,
        JSON.stringify({ userId: userData.id, username: userData.username })
      );
    } else {
      memoryStorage.tokens.set(token, JSON.stringify({ userId: userData.id, username: userData.username }));
      saveMemoryStorageToFile();
    }
  } catch (error) {
    console.warn('[Auth] Redis 存储 token 失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
    memoryStorage.tokens.set(token, JSON.stringify({ userId: userData.id, username: userData.username }));
    saveMemoryStorageToFile();
  }

  return {
    token,
    user: {
      id: userData.id,
      username: userData.username,
      role: userData.role
    },
    isDefaultPassword: userData.isDefaultPassword || false
  };
}

/**
 * 检查用户是否存在
 */
async function userExists(username) {
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      return await redisClient.exists(KEYS.USER_PREFIX + username) === 1;
    }
  } catch (error) {
    console.warn('[Auth] Redis userExists 失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
  }
  return memoryStorage.users.has(username);
}

/**
 * 检查token是否有效
 */
async function isTokenValid(token) {
  if (!token) return false;

  const payload = verifyToken(token);
  if (!payload) return false;

  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      const exists = await redisClient.exists(KEYS.TOKEN_PREFIX + token) === 1;
      return exists;
    }
  } catch (error) {
    console.warn('[Auth] Redis isTokenValid 失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
  }
  return memoryStorage.tokens.has(token);
}

/**
 * 登出
 */
async function logout(token) {
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      await redisClient.del(KEYS.TOKEN_PREFIX + token);
      return;
    }
  } catch (error) {
    console.warn('[Auth] Redis logout 失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
  }
  memoryStorage.tokens.delete(token);
  saveMemoryStorageToFile();
}

/**
 * 检查权限
 */
async function hasPermission(token, permission) {
  if (!authEnabled) return true;

  const payload = verifyToken(token);
  if (!payload) return false;

  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      const roleData = await redisClient.get(KEYS.ROLE_PREFIX + payload.role);
      if (!roleData) return false;
      const role = JSON.parse(roleData);
      return role.permissions.includes('*') || role.permissions.includes(permission);
    }
  } catch (error) {
    console.warn('[Auth] Redis hasPermission 失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
  }
  const roleData = memoryStorage.roles.get(payload.role);
  if (!roleData) return false;
  const role = JSON.parse(roleData);
  return role.permissions.includes('*') || role.permissions.includes(permission);
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

  if (redisClient && redisReady && redisClient.isOpen) {
    try {
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
      return users;
    } catch (error) {
      console.warn('[Auth] Redis listUsers 失败，降级到内存存储:', error.message);
      redisReady = false;
      _scheduleReconnect();
    }
  }

  for (const [username, data] of memoryStorage.users.entries()) {
    const userData = JSON.parse(data);
    users.push({
      id: userData.id,
      username: userData.username,
      role: userData.role,
      createdAt: userData.createdAt
    });
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
  if (redisClient && redisReady && redisClient.isOpen) {
    try {
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
    } catch (error) {
      console.warn('[Auth] Redis updateUser 查询失败，降级到内存存储:', error.message);
      redisReady = false;
      _scheduleReconnect();
    }
  }

  if (!targetUser) {
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
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      await redisClient.setEx(
        KEYS.USER_PREFIX + targetUsername,
        86400 * 365,
        JSON.stringify(targetUser)
      );
    } else {
      memoryStorage.users.set(targetUsername, JSON.stringify(targetUser));
      saveMemoryStorageToFile();
    }
  } catch (error) {
    console.warn('[Auth] Redis updateUser 保存失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
    memoryStorage.users.set(targetUsername, JSON.stringify(targetUser));
    saveMemoryStorageToFile();
  }

  // 删除该用户的所有 token（强制重新登录）
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
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
      saveMemoryStorageToFile();
    }
  } catch (error) {
    console.warn('[Auth] Redis updateUser 删除token失败:', error.message);
    redisReady = false;
    _scheduleReconnect();
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
  if (redisClient && redisReady && redisClient.isOpen) {
    try {
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
    } catch (error) {
      console.warn('[Auth] Redis deleteUser 查询失败，降级到内存存储:', error.message);
      redisReady = false;
      _scheduleReconnect();
    }
  }

  if (!targetUsername) {
    for (const [username, dataStr] of memoryStorage.users.entries()) {
      const user = JSON.parse(dataStr);
      if (user.id === userId) {
        targetUsername = username;
        memoryStorage.users.delete(username);
        break;
      }
    }
    saveMemoryStorageToFile();
  }

  if (!targetUsername) {
    return false;
  }

  // 删除该用户的所有 token
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
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
      saveMemoryStorageToFile();
    }
  } catch (error) {
    console.warn('[Auth] Redis deleteUser 删除token失败:', error.message);
    redisReady = false;
    _scheduleReconnect();
  }

  return true;
}

/**
 * 修改密码
 */
async function changePassword(username, newPassword) {
  let userData = null;

  // 查找用户
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
      const data = await redisClient.get(KEYS.USER_PREFIX + username);
      if (data) {
        userData = JSON.parse(data);
      }
    }
  } catch (error) {
    console.warn('[Auth] Redis changePassword 读取失败，降级到内存存储:', error.message);
    redisReady = false;
    _scheduleReconnect();
  }

  if (!userData) {
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
  // 清除默认密码标记
  userData.isDefaultPassword = false;

  // 保存更新
  if (redisClient) {
    try {
      await redisClient.setEx(
        KEYS.USER_PREFIX + username,
        86400 * 365,
        JSON.stringify(userData)
      );
    } catch (error) {
      console.warn('[Auth] Redis 创建用户失败，降级到内存存储:', error.message);
      redisReady = false;
      _scheduleReconnect();
      memoryStorage.users.set(username, JSON.stringify(userData));
      saveMemoryStorageToFile();
    }
  } else {
    memoryStorage.users.set(username, JSON.stringify(userData));
    saveMemoryStorageToFile(); // 保存到文件
  }

  // 删除该用户的所有 token（强制重新登录）
  try {
    if (redisClient && redisReady && redisClient.isOpen) {
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
      saveMemoryStorageToFile();
    }
  } catch (error) {
    console.warn('[Auth] Redis changePassword 删除token失败:', error.message);
    redisReady = false;
    _scheduleReconnect();
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
  KEYS,
  isEnabled: () => authEnabled,
  redisClient,
  memoryStorage
};
