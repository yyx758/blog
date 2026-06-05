# Blog 项目指南

> 供 AI 助手快速了解本项目，接手开发任务。

## 项目概述

基于 Astro 6 的静态博客，部署在 Vercel，通过 GitHub OAuth 管理员面板发布文章。支持在线编辑和上传 MD 文件两种方式发布内容。

## 技术栈

| 技术 | 用途 |
|------|------|
| Astro 6 | 静态站点生成 |
| Tailwind CSS 4 | 样式（Vite 插件方式集成） |
| MDX | 文章格式 |
| Vercel | 部署 + Serverless Functions |
| GitHub API | 文章/图片 CRUD |
| GitHub OAuth | 管理员认证 |
| marked.js | 编辑器内 Markdown 实时预览（CDN 加载） |

## 项目结构

```
Blog/
├── api/                          # Vercel Serverless Functions
│   ├── auth.ts                   # GitHub OAuth 认证流程
│   └── posts.ts                  # 文章 CRUD + 图片上传/代理
├── src/
│   ├── components/
│   │   ├── AdminPanel.astro      # 管理面板（登录、列表、编辑器、上传）
│   │   └── PostCard.astro        # 文章卡片组件
│   ├── layouts/
│   │   └── BaseLayout.astro      # 基础布局
│   ├── pages/
│   │   ├── index.astro           # 首页
│   │   ├── posts/
│   │   │   └── index.astro       # 文章列表页
│   │   ├── tags/
│   │   │   └── index.astro       # 标签页
│   │   └── about.astro           # 关于页
│   └── styles/
│       └── global.css            # 全局样式 + Tailwind
├── public/                       # 静态资源
├── md/                           # 项目文档
├── vercel.json                   # Vercel 路由配置
├── astro.config.mjs              # Astro 配置
├── package.json                  # 依赖
└── .gitignore                    # 忽略 .env* 文件
```

## 环境变量（Vercel）

在 Vercel 项目 Settings → Environment Variables 中配置：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID | `Ov23li...` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret | `secret` |
| `GITHUB_REPO` | 仓库路径（owner/repo） | `yyx758/blog` |
| `DEPLOY_HOOK_URL` | Vercel Deploy Hook URL（可选，用于发布后自动重建） | `https://api.vercel.com/v1/integrations/deploy/...` |

**注意：** 环境变量值不要有多余的空格或制表符，代码中已做 `.trim()` 处理。

## 部署命令

### 构建本地预览
```bash
npx astro build
npx astro preview
```

### 部署到 Vercel 生产环境
```bash
npx vercel --prod --yes
```
这会直接部署，不经过 git push。部署完成后网站立即更新。

### 推送到 GitHub
```bash
git add -A
git commit -m "feat: 你的提交信息"
git push origin main
```

**注意：** GitHub-Vercel 已集成，push 到 main 后 Vercel 会自动重新部署。

## GitHub OAuth 配置

### 创建 OAuth App
1. 打开 https://github.com/settings/developers
2. 点击 **New OAuth App**
3. Application name: 随便填
4. Homepage URL: `https://my-blog-yyyyx.vercel.app`
5. Authorization callback URL: `https://my-blog-yyyyx.vercel.app/api/auth`
6. 创建后获取 Client ID 和 Client Secret

### Vercel 部署保护
必须关闭 Deployment Protection：
- Vercel 项目 → Settings → Deployment Protection
- 关闭 "Require Log In"（否则 /api/* 路径会被拦截返回 401）

## API 接口说明

### POST /api/auth
GitHub OAuth 认证，返回 token。

### GET /api/posts
获取文章列表。需要 `Authorization: Bearer <token>` 头。

### GET /api/posts?image=xxx.png
图片代理，从 GitHub 读取 `public/images/xxx.png` 并返回二进制数据。用于编辑器内粘贴图片的即时预览。

### POST /api/posts
创建文章。Body:
```json
{
  "filename": "my-post.mdx",
  "title": "标题",
  "date": "2025-01-01",
  "tags": ["tag1", "tag2"],
  "description": "描述",
  "draft": false,
  "body": "Markdown 正文"
}
```

### POST /api/posts（图片上传）
上传图片到 GitHub。Body:
```json
{
  "action": "upload-image",
  "filename": "paste-xxx.png",
  "content": "base64编码的图片数据"
}
```

### PUT /api/posts
更新文章。

### DELETE /api/posts
删除文章。Body: `{ "filename": "xxx.mdx", "sha": "git-sha", "title": "标题" }`

## 管理面板功能

访问方式：点击页面左下角「管理文章」按钮。

### 登录
- GitHub OAuth 登录，token 存储在 localStorage

### 文章列表
- 显示所有文章，带草稿标签
- 右侧删除按钮直接删除

### 在线编辑器（新建/编辑）
- 全屏编辑器，支持编辑/预览/分屏三种模式
- Markdown 工具栏（H1-H3、加粗、斜体、代码、链接、图片、列表、引用、表格等）
- 快捷键：Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+K 链接、Ctrl+1/2/3 标题、Tab 缩进
- Ctrl+Z / Ctrl+Y 原生撤销重做（不被拦截）
- 粘贴图片自动上传到 GitHub 并插入 markdown
- 元信息编辑：标题、日期、标签、描述、草稿

### 上传文件
- 选择 .md/.mdx 文件
- 弹出表单编辑元信息（自动解析 frontmatter 预填）
- 确认后发布到 GitHub

## 图片处理流程

1. 用户在编辑器中 Ctrl+V 粘贴图片
2. 前端读取剪贴板图片 → base64 编码
3. 调用 `POST /api/posts`（action=upload-image）上传到 GitHub `public/images/`
4. 前端插入 markdown: `![name](/api/posts?image=name.png)`
5. 预览时通过 `/api/posts?image=xxx.png` API 代理显示图片（不依赖 Vercel 部署）
6. 用户点「发布」后文章推送到 GitHub，Vercel 自动重建
7. 重建后图片可通过 `/images/xxx.png` 静态路径访问

## 常见问题

### 粘贴图片 404
图片通过 API 代理显示，不需要等 Vercel 重建。如果仍 404，检查 `/api/posts` 接口是否正常（可能 token 过期）。

### 文章删除后网站没更新
Astro 是静态站，删除文章后需要 Vercel 重新部署。配置 `DEPLOY_HOOK_URL` 环境变量可自动触发重建。

### Git push 失败
可能是网络问题或没有 GitHub SSH key。可以先用 `npx vercel --prod --yes` 直接部署，网络恢复后再 push。

### 管理面板 401
检查 Vercel Deployment Protection 是否已关闭，环境变量是否正确。

## 开发工作流

1. 修改代码
2. `npx astro build` 本地验证
3. `npx vercel --prod --yes` 部署到 Vercel
4. `git add -A && git commit && git push origin main` 推送到 GitHub
