/**
 * 定时任务路由 - Express Router 版
 */
const express = require('express');

function createSchedulerRouter(scheduler) {
  const router = express.Router();

  router.get('/tasks', async (req, res) => {
    try {
      const tasks = await scheduler.getTasks();
      res.json({ ok: true, data: tasks, status: scheduler.getStatus() });
    } catch (e) {
      res.status(500).json({ ok: false, message: '获取任务列表失败' });
    }
  });

  router.post('/tasks', async (req, res) => {
    try {
      const task = await scheduler.createTask(req.body);
      res.status(201).json({ ok: true, data: task });
    } catch (e) {
      res.status(400).json({ ok: false, message: e.message });
    }
  });

  router.put('/tasks/:id', async (req, res) => {
    try {
      const task = await scheduler.updateTask(req.params.id, req.body);
      res.json({ ok: true, data: task });
    } catch (e) {
      const code = e.message === '任务不存在' ? 404 : 400;
      res.status(code).json({ ok: false, message: e.message });
    }
  });

  router.delete('/tasks/:id', async (req, res) => {
    try {
      await scheduler.deleteTask(req.params.id);
      res.json({ ok: true, message: '任务已删除' });
    } catch (e) {
      res.status(404).json({ ok: false, message: e.message });
    }
  });

  router.post('/tasks/:id/run', async (req, res) => {
    try {
      const result = await scheduler.runTask(req.params.id);
      res.json({ ok: true, data: result });
    } catch (e) {
      res.status(404).json({ ok: false, message: e.message });
    }
  });

  router.get('/status', (req, res) => {
    res.json({ ok: true, data: scheduler.getStatus() });
  });

  return router;
}

module.exports = { createSchedulerRouter };
