/**
 * 设置路由
 */
function createSettingsRoutes(settingsController) {
  return function settingsRoutes(req, res, next) {
    const { method, url } = req;

    // GET /api/settings - 获取设置
    if (url === '/api/settings' && method === 'GET') {
      return settingsController.getSettings(req, res);
    }

    // PUT /api/settings - 更新设置
    if (url === '/api/settings' && method === 'PUT') {
      return settingsController.updateSettings(req, res);
    }

    // GET /api/settings/categories - 获取设置分类
    if (url === '/api/settings/categories' && method === 'GET') {
      return settingsController.getCategories(req, res);
    }

    // ─── UA 管理 API ───

    // GET /api/settings/ua/global - 获取全局 UA
    if (url === '/api/settings/ua/global' && method === 'GET') {
      return settingsController.getGlobalUA(req, res);
    }

    // POST /api/settings/ua/global - 设置全局 UA
    if (url === '/api/settings/ua/global' && method === 'POST') {
      return settingsController.setGlobalUA(req, res);
    }

    // GET /api/settings/ua/channel - 获取频道 UA
    if (url === '/api/settings/ua/channel' && method === 'GET') {
      return settingsController.getChannelUA(req, res);
    }

    // PUT /api/settings/ua/channel - 设置频道 UA
    if (url === '/api/settings/ua/channel' && method === 'PUT') {
      return settingsController.setChannelUA(req, res);
    }

    // GET /api/settings/ua/effective - 获取有效 UA
    if (url === '/api/settings/ua/effective' && method === 'GET') {
      return settingsController.getEffectiveUA(req, res);
    }

    // 继续处理下一个路由
    next();
  };
}

module.exports = createSettingsRoutes;
