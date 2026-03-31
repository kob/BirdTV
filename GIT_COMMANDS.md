# Git 提交命令

## 1. 检查当前状态
```bash
cd c:\Users\Administrator\work\birdtv330\BirdTV
git status
```

## 2. 查看所有变更
```bash
git diff --stat
```

## 3. 添加所有变更
```bash
git add .
```

## 4. 提交代码
```bash
git commit -m "feat: 完成 EPG 管理、分组管理、批量操作功能 (v3.3.0)

主要更新:
- 新增 EPG 管理页面，支持 4 种加载策略（自动/手动/自定义/智能）
- 新增分组管理功能，预设 10 个分组（CCTV/卫视/地方台等）
- 频道管理批量修改支持分组和 UA 下拉选择
- 合并分组管理与 UA 管理，优化菜单顺序
- 移动端显示 EPG 节目信息（参考 myTV SUPER）
- 清理测试文件和缓存文件（13 个文件）
- 完善项目文档（PROJECT.md, CHECKLIST.md, COMMIT_MESSAGE.md）

新增 API:
- GET /api/channels/groups - 获取所有分组
- GET /api/epg/groups - 获取 EPG 分组
- POST /api/epg/batch-set-group - 批量设置分组

技术改进:
- 删除 test-*.js, test.m3u, core.*, *.old, *.backup 等 13 个文件
- 清理 files/cache/*.json 和 data/exports/*.m3u 等 20+ 缓存文件
- 更新 package.json 版本号到 3.3.0
- 新增 PROJECT.md, CHECKLIST.md, COMMIT_MESSAGE.md, SUMMARY.md

功能完整性:
- ✅ 频道管理（CRUD、批量操作、分组）
- ✅ EPG 管理（CRUD、策略、批量操作、分组）
- ✅ 分组与 UA 管理（分组管理、UA 管理）
- ✅ 移动端（播放、EPG 显示）
- ✅ 所有 API 接口测试通过

代码质量:
- ✅ 删除所有测试和调试代码
- ✅ 统一代码风格
- ✅ 完善错误处理
- ✅ 无控制台错误输出

文档完整性:
- ✅ README.md, PROJECT.md, CHECKLIST.md
- ✅ DEPLOYMENT_OVERVIEW.md, CLOUDSTUDIO_DEPLOY.md
- ✅ MOBILE_GUIDE.md, TROUBLESHOOTING.md
- ✅ COMMIT_MESSAGE.md, SUMMARY.md"
```

## 5. 推送到远程仓库
```bash
git push origin main
```

## 6. 创建版本标签
```bash
git tag -a v3.3.0 -m "Release version 3.3.0 - EPG 管理、分组管理、批量操作

完整功能:
- EPG 管理（4 种策略、批量操作、分组）
- 频道管理（批量修改、分组、UA）
- 分组与 UA 管理（合并、预设分组）
- 移动端（EPG 显示）

技术改进:
- 清理 13 个不必要文件
- 清理 20+ 缓存文件
- 完善 8 个文档

兼容性:
- 向后兼容数据格式
- 无需数据迁移
- 支持主流浏览器"

git push origin v3.3.0
```

## 7. 验证提交
```bash
# 查看提交历史
git log --oneline -5

# 查看标签
git tag -l

# 查看文件统计
git show --stat HEAD
```

## 快速提交（单行命令）
```bash
git add . && git commit -m "feat: 完成 EPG 管理、分组管理、批量操作功能 (v3.3.0)" && git push origin main && git tag -a v3.3.0 -m "Release v3.3.0" && git push origin v3.3.0
```

---

**注意**: 
1. 提交前确保在正确的分支（main/master）
2. 确保已安装 Git 并配置好 SSH/HTTPS
3. 确保有远程仓库的推送权限
4. 建议先查看 git diff 确认变更内容
5. 提交后验证远程仓库是否更新成功
