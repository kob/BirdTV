# SAP BAS 开发环境配置指南

## 📋 环境要求

- SAP BTP 账号（Business Application Studio）
- Node.js 18+（BAS 默认已安装）
- npm 或 yarn

## 🚀 在 SAP BAS 中设置 BirdTV 项目

### 1. 打开 BAS

1. 登录 [SAP BTP Cockpit](https://cockpit.btp.cloud.sap/)
2. 进入 **Subaccount** → **Cloud Foundry** → **Spaces**
3. 打开 **Business Application Studio**
4. 点击 **Create Dev Space**

### 2. 创建开发空间

- **Dev Space Name**: `birdtv-dev`
- **Type**: 选择 `Basic` 或 `Full Stack Cloud Application`
- **Size**: 建议 2GB+ 内存
- 点击 **Create Dev Space**

### 3. 克隆项目

在 BAS 终端中：

```bash
# 方法 1: 从 Git 克隆
git clone <your-repo-url>
cd BirdTV

# 方法 2: 如果项目已存在
cd /workspaces/BirdTV  # BAS 默认工作区
```

### 4. 安装依赖

```bash
npm install
```

### 5. 启动开发服务器

```bash
npm run start:web:local
```

启动后 BAS 会显示端口预览按钮（8771），点击即可访问。

## 🔧 VS Code 配置

BAS 内置了 VS Code，已为你配置好：

### 调试配置

已创建 `.vscode/launch.json`，包含：
- **BirdTV: 启动开发服务器** - 开发模式
- **BirdTV: 生产模式** - 生产模式

使用方法：
1. 按 `F5` 或点击左侧调试图标
2. 选择配置并启动

### 推荐扩展（BAS 已预装）

- ESLint - 代码检查
- Prettier - 代码格式化
- GitLens - Git 增强
- Live Server - 实时预览（可选）

## 📝 日常开发流程

### 启动项目

```bash
cd /workspaces/BirdTV
npm run start:web:local
```

### 查看日志

开发服务器日志会直接显示在 BAS 终端中。

### 停止服务

在终端按 `Ctrl + C` 停止服务。

### 代码编辑

- 在左侧资源管理器中打开文件
- 使用编辑器修改代码
- 保存后自动重启服务（使用 `nodemon` 需安装）

## 🚀 部署流程

开发完成后，从 BAS 部署到 CloudStudio：

### 快速部署

```bash
bash deploy.sh
```

按脚本提示操作即可。

### 手动部署

```bash
# 1. 安装 CloudStudio CLI
npm install -g @cloudbase/cli

# 2. 登录
tcb login

# 3. 部署
tcb deploy
```

详细步骤参考 `CLOUDSTUDIO_DEPLOY.md`。

## 🌐 Cloudflare 集成

BAS 中配置 Cloudflare Worker：

```bash
# 1. 安装 Wrangler
npm install -g wrangler

# 2. 登录
wrangler login

# 3. 初始化
wrangler init birdtv-worker

# 4. 编辑 worker.js（使用项目中的 cloudflare-worker.js）
# 5. 部署
wrangler deploy
```

## 🔍 常见问题

### Q: BAS 启动慢怎么办？

A:
- 关闭不使用的扩展
- 使用 `Basic` 类型 Dev Space
- 增加内存配置

### Q: 端口被占用？

A:
```bash
# 查看端口占用
lsof -i :8771
# 修改 .env 中的 PORT 配置
```

### Q: 无法访问外部 API？

A: 检查 BAS 网络代理设置：
```bash
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

### Q: Git 推送失败？

A: 配置 Git 凭证：
```bash
git config --global credential.helper store
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

## 📚 相关文档

- [BAS 官方文档](https://developers.sap.com/topics/business-application-studio.html)
- [CloudStudio 部署指南](./CLOUDSTUDIO_DEPLOY.md)
- [BirdTV 开发文档](./DEVELOPMENT.md)
