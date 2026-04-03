/**
 * 频道路由
 */
function createChannelsRoutes(channelController) {
  return function channelsRoutes(req, res, next) {
    const { method, url, query, body } = req;

    // GET /api/channels - 获取频道列表
    if (url.startsWith('/api/channels') && !url.includes('/search') && method === 'GET') {
      return channelController.getChannels(req, res);
    }

    // GET /api/channels/search - 搜索频道
    if (url.startsWith('/api/channels/search') && method === 'GET') {
      return channelController.searchChannels(req, res);
    }

    // POST /api/channels - 创建频道
    if (url === '/api/channels' && method === 'POST') {
      return channelController.createChannel(req, res);
    }

    // POST /api/channels/batch - 批量导入频道
    if (url === '/api/channels/batch' && method === 'POST') {
      return channelController.batchImportChannels(req, res);
    }

    // POST /api/channels/batch-import - 批量导入频道（别名）
    if (url === '/api/channels/batch-import' && method === 'POST') {
      return channelController.batchImportChannels(req, res);
    }

    // POST /api/channels/batch/delete - 批量删除频道
    if (url === '/api/channels/batch/delete' && method === 'POST') {
      return channelController.batchDeleteChannels(req, res);
    }

    // POST /api/channels/batch/update - 批量修改频道
    if (url === '/api/channels/batch/update' && method === 'POST') {
      return channelController.batchUpdateChannels(req, res);
    }

    // GET /api/channels/groups - 获取分组列表
    if (url === '/api/channels/groups' && method === 'GET') {
      return channelController.getGroups(req, res);
    }

    // 处理带 ID 的路由
    const match = url.match(/^\/api\/channels\/([^/]+)$/);
    if (match) {
      const id = match[1];
      req.params = { id };

      // GET /api/channels/:id - 获取频道详情
      if (method === 'GET') {
        return channelController.getChannel(req, res);
      }

      // PUT /api/channels/:id - 更新频道
      if (method === 'PUT') {
        return channelController.updateChannel(req, res);
      }

      // DELETE /api/channels/:id - 删除频道
      if (method === 'DELETE') {
        return channelController.deleteChannel(req, res);
      }
    }

    // 继续处理下一个路由
    next();
  };
}

module.exports = createChannelsRoutes;
