const auth = require('../../auth');

class AuthController {
  constructor(storageService) {
    this.storage = storageService;
    this.auth = auth;
  }

  /**
   * 用户登录
   */
  async login(req, res) {
    try {
      const { username, password } = req.body || {};

      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '用户名和密码不能为空'
        }));
      }

      // 使用 auth 模块验证用户
      const result = await this.auth.verifyUser(username, password);

      if (!result) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'invalid_credentials',
          message: '用户名或密码错误'
        }));
      }

      // 设置 authToken cookie，方便 HLS 播放器自动携带认证信息
      const cookieOptions = [
        `authToken=${result.token}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=86400' // 24 小时
      ].join('; ');

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': cookieOptions
      });
      res.end(JSON.stringify({
        ok: true,
        data: {
          token: result.token,
          user: result.user,
          isDefaultPassword: result.isDefaultPassword
        }
      }));
    } catch (error) {
      console.error('[AuthController] 登录失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '登录失败'
      }));
    }
  }

  /**
   * 用户登出
   */
  async logout(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;

      if (token) {
        await this.auth.logout(token);
      }

      res.json({ ok: true, message: '登出成功' });
    } catch (error) {
      console.error('[AuthController] 登出失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '登出失败'
      }));
    }
  }

  /**
   * 获取当前用户信息
   */
  async getUserInfo(req, res) {
    try {
      const user = req.user;

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'unauthorized',
          message: '未授权'
        }));
      }

      res.json({ ok: true, data: user });
    } catch (error) {
      console.error('[AuthController] 获取用户信息失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取用户信息失败'
      }));
    }
  }

  /**
   * 检查是否使用默认密码
   */
  async checkDefaultPassword(req, res) {
    try {
      const currentUser = req.user;

      if (!currentUser) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'unauthorized',
          message: '未授权'
        }));
      }

      // 从存储中获取用户信息
      let userData = null;
      const redisClient = this.auth.redisClient || null;
      
      if (redisClient) {
        const data = await redisClient.get('auth:user:' + currentUser.username);
        if (data) {
          userData = JSON.parse(data);
        }
      } else {
        const memoryStorage = this.auth.memoryStorage;
        if (memoryStorage && memoryStorage.users) {
          const data = memoryStorage.users.get(currentUser.username);
          if (data) {
            userData = JSON.parse(data);
          }
        }
      }

      const isDefaultPassword = userData?.isDefaultPassword || false;

      res.json({ ok: true, data: { isDefaultPassword } });
    } catch (error) {
      console.error('[AuthController] 检查默认密码失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '检查失败'
      }));
    }
  }

  /**
   * 修改密码
   */
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body || {};
      const currentUser = req.user;

      if (!oldPassword || !newPassword) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '旧密码和新密码不能为空'
        }));
      }

      // 验证旧密码
      const verifyResult = await this.auth.verifyUser(currentUser.username, oldPassword);

      if (!verifyResult) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'invalid_password',
          message: '旧密码错误'
        }));
      }

      // 更新密码
      const success = await this.auth.changePassword(currentUser.username, newPassword);

      if (!success) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'server_error',
          message: '修改密码失败'
        }));
      }

      res.json({ ok: true, message: '密码修改成功，请重新登录' });
    } catch (error) {
      console.error('[AuthController] 修改密码失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '修改密码失败'
      }));
    }
  }

  /**
   * 获取用户列表（管理员）
   */
  async getUsers(req, res) {
    try {
      // 检查是否为管理员
      if (req.user.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'forbidden',
          message: '需要管理员权限'
        }));
      }

      const users = await this.auth.listUsers();

      res.json({ ok: true, data: users });
    } catch (error) {
      console.error('[AuthController] 获取用户列表失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '获取用户列表失败'
      }));
    }
  }

  /**
   * 创建用户（管理员）
   */
  async createUser(req, res) {
    try {
      // 检查是否为管理员
      if (req.user.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'forbidden',
          message: '需要管理员权限'
        }));
      }

      const { username, password, role = 'user' } = req.body || {};

      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '用户名和密码不能为空'
        }));
      }

      // 使用 auth 模块创建用户
      const result = await this.auth.createUser(username, password, role);

      if (!result) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'creation_failed',
          message: '创建用户失败，用户可能已存在'
        }));
      }

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: true,
        data: {
          id: result.userId,
          username: result.username,
          role: result.role
        }
      }));
    } catch (error) {
      console.error('[AuthController] 创建用户失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '创建用户失败'
      }));
    }
  }

  /**
   * 更新用户（管理员）
   */
  async updateUser(req, res) {
    try {
      // 检查是否为管理员
      if (req.user.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'forbidden',
          message: '需要管理员权限'
        }));
      }

      const { id } = req.params || {};
      const { role, password } = req.body || {};

      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '用户 ID 不能为空'
        }));
      }

      if (!role && !password) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '至少提供角色或密码中的一项进行更新'
        }));
      }

      const updateData = {};
      if (role) updateData.role = role;
      if (password) updateData.password = password;

      const result = await this.auth.updateUser(id, updateData);

      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: '用户不存在'
        }));
      }

      res.json({ ok: true, data: result });
    } catch (error) {
      console.error('[AuthController] 更新用户失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '更新用户失败'
      }));
    }
  }

  /**
   * 删除用户（管理员）
   */
  async deleteUser(req, res) {
    try {
      // 检查是否为管理员
      if (req.user.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'forbidden',
          message: '需要管理员权限'
        }));
      }

      const { id } = req.params || {};
      const currentUser = req.user;

      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'validation_error',
          message: '用户 ID 不能为空'
        }));
      }

      // 不能删除自己
      if (id === currentUser.id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'invalid_operation',
          message: '不能删除当前登录用户'
        }));
      }

      const deleted = await this.auth.deleteUser(id);

      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          ok: false,
          error: 'not_found',
          message: '用户不存在'
        }));
      }

      res.json({ ok: true, message: '用户已删除' });
    } catch (error) {
      console.error('[AuthController] 删除用户失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
        ok: false,
        error: 'server_error',
        message: '删除用户失败'
      }));
    }
  }
}

module.exports = AuthController;
