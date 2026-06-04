# 极简个人技术博客

基于 Astro + TypeScript + Tailwind CSS + MDX 构建的中文技术博客，部署在 Vercel 上。

## 技术栈

- **Astro 6** — 静态站点生成
- **Tailwind CSS v4** — 样式框架
- **MDX** — 文章格式，支持在 Markdown 中嵌入组件
- **Shiki** — 代码高亮（github-light / github-dark 主题）
- **Vercel** — 部署平台 + Serverless Functions

## 功能

- 首页 Hero 展示 + 最近文章 + 标签云
- 文章详情页，支持代码高亮、目录导航、阅读时间估算
- 标签分类页面
- 暗色模式切换
- 回到顶部按钮
- 浏览器内文章管理（新建 / 编辑 / 删除），支持 Markdown 实时预览
- 自定义 404 页面

## 项目结构

```
/
├── api/
│   ├── auth.ts              # GitHub OAuth 认证
│   └── posts.ts             # 文章增删改查 API
├── public/
│   └── images/              # 静态资源
├── src/
│   ├── components/
│   │   ├── AdminPanel.astro # 管理面板（含全屏编辑器）
│   │   ├── Header.astro     # 顶部导航栏
│   │   ├── Footer.astro     # 页脚
│   │   ├── PostCard.astro   # 文章卡片
│   │   └── TableOfContents.astro  # 目录导航
│   ├── content/
│   │   └── posts/           # 文章 .mdx 文件
│   ├── layouts/
│   │   └── BaseLayout.astro # 基础布局
│   ├── pages/
│   │   ├── index.astro      # 首页
│   │   ├── posts/
│   │   │   ├── index.astro      # 文章列表
│   │   │   └── [...slug].astro  # 文章详情
│   │   ├── tags/
│   │   │   ├── index.astro      # 标签列表
│   │   │   └── [...tag].astro   # 标签下的文章
│   │   ├── about.astro      # 关于页面
│   │   └── 404.astro        # 404 页面
│   ├── styles/
│   │   └── global.css       # 全局样式 + 暗色模式变量
│   └── content.config.ts    # 内容集合 Schema
├── astro.config.mjs
└── package.json
```

## 本地开发

```bash
npm install
npm run dev
```

访问 `http://localhost:4321`。

## 构建部署

```bash
npm run build    # 构建到 ./dist/
npm run preview  # 本地预览构建结果
```

推送到 GitHub 后 Vercel 自动部署。

## 管理面板配置

博客内置文章管理功能，需要配置 GitHub OAuth 才能使用：

1. 在 [GitHub Developer Settings](https://github.com/settings/developers) 创建 OAuth App
   - Callback URL: `https://your-domain.vercel.app/api/auth`
2. 在 Vercel 项目 Settings → Environment Variables 添加：
   - `GITHUB_CLIENT_ID` — OAuth App 的 Client ID
   - `GITHUB_CLIENT_SECRET` — OAuth App 的 Client Secret
   - `SITE_URL` — `https://your-domain.vercel.app`
   - `GITHUB_REPO` — `username/repo` 格式

详见 [部署指南](md/deployment-guide.md)。

## 写文章

在 `src/content/posts/` 下创建 `.mdx` 文件：

```yaml
---
title: "文章标题"
date: 2025-01-01
tags: ["标签1", "标签2"]
description: "一句话描述"
draft: false
---

正文内容，支持 Markdown 语法。
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 本地预览构建结果 |
