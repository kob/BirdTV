/**
 * 认证路由 - Express Router 版
 * 方法名与 AuthController 完全对应
 */
const express = require('express');
const { adminMiddleware } = require('../middleware/auth');

function createAuthRouter(authController) {
  const router = express.Router();

  // 公开路由（无需认证，已挂载在 /api/auth 下）
  router.post('/login', (req, res) => authController.login(req, res));

  // 需要认证的路由（由上层 authMiddleware 处理）
  router.post('/logout', (req, res) => authController.logout(req, res));
  router.get('/userinfo', (req, res) => authController.getUserInfo(req, res));
  router.put('/password', (req, res) => authController.changePassword(req, res));
  router.get('/check-default-password', (req, res) => authController.checkDefaultPassword(req, res));

  // 管理员路由
  router.get('/users', adminMiddleware, (req, res) => authController.getUsers(req, res));
  router.post('/users', adminMiddleware, (req, res) => authController.createUser(req, res));
  router.put('/users/:id', adminMiddleware, (req, res) => authController.updateUser(req, res));
  router.delete('/users/:id', adminMiddleware, (req, res) => authController.deleteUser(req, res));

  return router;
}

module.exports = { createAuthRouter };
