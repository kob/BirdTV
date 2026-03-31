/**
 * 认证路由
 * 将 HTTP 请求分发到 AuthController 的各个方法
 */
const { authMiddleware, adminMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

function createAuthRoutes(authController) {
  return function authRoutes(req, res, next) {
    const { method, url } = req;

    // POST /api/auth/login - 用户登录（无需认证）
    if (url === '/api/auth/login' && method === 'POST') {
      return authController.login(req, res);
    }

    // POST /api/auth/logout - 用户登出（可选认证）
    if (url === '/api/auth/logout' && method === 'POST') {
      return optionalAuthMiddleware(req, res, () => {
        return authController.logout(req, res);
      });
    }

    // 以下接口都需要认证
    authMiddleware(req, res, () => {

      // GET /api/auth/userinfo - 获取用户信息
      if (url === '/api/auth/userinfo' && method === 'GET') {
        return authController.getUserInfo(req, res);
      }

      // PUT /api/auth/password - 修改密码
      if (url === '/api/auth/password' && method === 'PUT') {
        return authController.changePassword(req, res);
      }

      // GET /api/auth/users - 获取用户列表（管理员）
      if (url === '/api/auth/users' && method === 'GET') {
        return adminMiddleware(req, res, () => {
          return authController.getUsers(req, res);
        });
      }

      // POST /api/auth/users - 创建用户（管理员）
      if (url === '/api/auth/users' && method === 'POST') {
        return adminMiddleware(req, res, () => {
          return authController.createUser(req, res);
        });
      }

      // PUT /api/auth/users/:id - 更新用户（管理员）
      if (url.startsWith('/api/auth/users/') && method === 'PUT') {
        const id = url.split('/').pop();
        req.params = { id };
        return adminMiddleware(req, res, () => {
          return authController.updateUser(req, res);
        });
      }

      // DELETE /api/auth/users/:id - 删除用户（管理员）
      if (url.startsWith('/api/auth/users/') && method === 'DELETE') {
        const id = url.split('/').pop();
        req.params = { id };
        return adminMiddleware(req, res, () => {
          return authController.deleteUser(req, res);
        });
      }

      // 未匹配的路由
      next();
    });
  };
}

module.exports = createAuthRoutes;
