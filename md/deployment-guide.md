# 博客部署指南：GitHub + Vercel + OAuth 完整解析

## 一、整体架构

```
你的电脑                          互联网
  │                                │
  │  git push                      │
  ▼                                │
┌─────────┐    自动触发构建     ┌─────────┐    用户访问     ┌─────────┐
│ GitHub  │ ──────────────────▶ │ Vercel  │ ◀───────────── │  浏览器  │
│ (代码仓库)│                    │ (托管+CDN)│               │ (读者)   │
└─────────┘                     └─────────┘               └─────────┘
                                     │
                                     │ GitHub OAuth 登录
                                     ▼
                                ┌─────────┐
                                │ GitHub  │
                                │ API     │
                                └─────────┘
```

## 二、三个平台各干什么

### GitHub — 代码仓库 + 内容存储

**作用**：存放博客的所有源代码和文章内容

```
yyx758/blog/
├── src/
│   ├── content/posts/     ← 文章 Markdown 文件
│   ├── components/        ← 页面组件
│   ├── pages/             ← 路由页面
│   └── layouts/           ← 布局模板
├── api/                   ← Vercel Serverless Functions
│   ├── auth.ts            ← GitHub OAuth 认证
│   └── posts.ts           ← 文章增删改查 API
├── astro.config.mjs       ← Astro 配置
└── package.json
```

**核心概念**：你每次 `git push`，代码就到了 GitHub 上。Vercel 会监听这个动作，自动拉取最新代码并构建部署。

---

### Vercel — 部署平台 + CDN + Serverless

**作用**：把你的静态网站部署到全球 CDN，让用户能通过 URL 访问

**它做了什么**：
1. **监听 GitHub**：你的仓库有新 push，Vercel 自动开始构建
2. **构建**：执行 `astro build`，生成静态 HTML/CSS/JS 文件
3. **部署**：把构建产物放到全球 CDN 节点上
4. **分配域名**：给你一个 `xxx.vercel.app` 的域名
5. **运行 Serverless Functions**：`api/auth.ts` 和 `api/posts.ts` 作为云函数运行

**Serverless Functions** 是什么？
```
普通静态网站：只能展示页面，不能执行后端代码
你的博客：    有 api/ 目录，里面的 .ts 文件会在 Vercel 的服务器上运行
```

这就是为什么我们能在 Vercel 上做 GitHub OAuth 登录和文章管理——这些后端逻辑跑在 Vercel 的云函数里。

---

### GitHub OAuth — 登录认证

**问题**：管理面板需要登录才能用，谁来验证"你是博主"？

**答案**：用 GitHub 账号登录。因为你的代码在 GitHub 上，只有你有写入权限。

**OAuth 流程**：
```
┌──────────┐    1. 点击"GitHub登录"     ┌──────────┐
│  博客页面  │ ───────────────────────▶  │ Vercel   │
│          │                            │ /api/auth │
└──────────┘                            └────┬─────┘
                                             │
                     2. 重定向到 GitHub 授权页  │
                                             ▼
                                      ┌──────────┐
                                      │  GitHub   │
                                      │  授权页面  │
                                      └────┬─────┘
                                           │
                     3. 你点击"Authorize"   │
                                             ▼
┌──────────┐    5. 返回 token           ┌──────────┐
│  博客页面  │ ◀──────────────────────── │ Vercel   │
│ (登录成功) │                           │ /api/auth │
└──────────┘                            └──────────┘
```

**具体步骤**：
1. 用户点击「GitHub 登录」
2. 打开新窗口，跳转到 GitHub 授权页：`https://github.com/login/oauth/authorize?client_id=xxx`
3. 用户在 GitHub 上点击「Authorize」
4. GitHub 重定向回你的 `/api/auth?code=xxx`
5. Vercel 云函数用 code 换取 access_token
6. 通过 `postMessage` 把 token 传回博客页面
7. 页面把 token 存到 `localStorage`

---

## 三、环境变量：连接三个平台的桥梁

Vercel 需要这些环境变量才能工作：

| 变量名 | 值 | 作用 |
|--------|------|------|
| `GITHUB_CLIENT_ID` | `Ov23liUOh6y5e5SExi1R` | OAuth 应用的标识，告诉 GitHub "是谁在请求登录" |
| `GITHUB_CLIENT_SECRET` | `*****` | OAuth 应用的密钥，用于验证身份（保密，不暴露给前端） |
| `SITE_URL` | `https://my-blog-yyyyx.vercel.app` | OAuth 回调地址，登录成功后跳转回来的地址 |
| `GITHUB_REPO` | `yyx758/blog` | 告诉 API 操作哪个仓库的文章 |
| `GITHUB_TOKEN` | `github_pat_...` | 可选；仓库为私有时，供图片代理读取 `public/images/` 中的图片 |

**为什么需要这些？**
```
没有 GITHUB_CLIENT_ID    → GitHub 不知道是你的应用在请求登录
没有 GITHUB_CLIENT_SECRET → 无法换取 access_token（安全验证）
没有 SITE_URL            → 登录成功后不知道跳转回哪里
没有 GITHUB_REPO         → API 不知道去哪个仓库读写文章
私有仓库没有 GITHUB_TOKEN → 文章编辑器里的 /api/posts?image=... 图片代理无法读取图片
```

---

## 四、文章管理的完整链路

当你在管理面板点「保存」时，发生了什么：

```
1. 浏览器收集表单数据
   { title, date, tags, body, ... }

2. 发送请求到 Vercel Serverless Function
   POST /api/posts
   Header: Authorization: Bearer <github_token>
   Body: { filename: "hello.mdx", title: "你好", ... }

3. /api/posts.ts 验证 token
   → 用 token 调用 GitHub API 验证身份
   → 确认你是仓库的 Owner

4. /api/posts.ts 调用 GitHub API 写入文件
   PUT https://api.github.com/repos/yyx758/blog/contents/src/content/posts/hello.mdx
   Body: { content: "base64编码的文章内容", sha: "...", message: "新增文章: 你好" }

5. GitHub 保存文件，触发 Vercel 重新构建部署

6. 返回成功给浏览器
```

**关键点**：
- 文章不是存在 Vercel 上，而是存在 GitHub 仓库里
- Vercel 云函数是"中间人"，帮浏览器调用 GitHub API
- 每次保存文章都会触发一次自动部署（因为仓库文件变了）

---

## 五、域名和访问

```
用户输入 URL
    │
    ▼
DNS 解析
    │
    ▼
Vercel CDN 节点（全球分布）
    │
    ├── 静态页面 → 直接返回 HTML/CSS/JS
    │
    └── /api/* 请求 → 路由到 Serverless Function
```

**你的域名**：
- `my-blog-yyyyx.vercel.app` — Vercel 默认域名（已生效）
- `291463.xyz` — 你的自定义域名（需要在 DNS 设置 CNAME 指向 Vercel）

---

## 六、常见问题

### Q: 为什么推送代码后没有自动部署？
**A**: Vercel 和 GitHub 的连接可能断了。去 Vercel Settings → Git 检查 Connected Repository 是否正常。

### Q: GitHub 登录失败怎么办？
**A**: 检查三件事：
1. GitHub OAuth App 的 callback URL 是否正确
2. Vercel 环境变量是否正确（变量名和值）
3. 环境变量是否部署到了 Production 环境

### Q: Serverless Function 和普通服务器有什么区别？
**A**: 
- 普通服务器：一直运行，占着资源
- Serverless：只在请求来时运行，用完就释放
- 优点：不用管服务器维护，按使用量计费（Vercel 免费额度够用）

### Q: 编辑器粘贴图片后 `/api/posts?image=...` 报错怎么办？
**A**: 图片标签请求不能携带 `Authorization` 头，所以图片代理必须允许免登录读取。当前代码已对 `GET /api/posts?image=...` 单独放行；如果仓库是私有的，还需要在 Vercel 添加 `GITHUB_TOKEN`，权限至少能读取该仓库内容。

### Q: 为什么文章存在 GitHub 而不是数据库？
**A**: 这是"Git-based CMS"模式。好处是：
- 文章版本由 Git 管理，有完整历史记录
- 不需要额外的数据库服务
- 打开 Pull Request 可以做文章审核
- 适合个人博客这种低频写入场景

---

## 七、部署流程总结

```
┌─────────────────────────────────────────────────────┐
│                    首次部署                           │
├─────────────────────────────────────────────────────┤
│ 1. 创建 GitHub 仓库                                   │
│ 2. 本地代码 git push 到 GitHub                        │
│ 3. Vercel 导入 GitHub 仓库                           │
│ 4. Vercel 自动构建并部署                               │
│ 5. 得到 https://my-blog-yyyyx.vercel.app             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    配置管理功能                        │
├─────────────────────────────────────────────────────┤
│ 1. GitHub 创建 OAuth App                             │
│    → 得到 Client ID 和 Client Secret                  │
│ 2. Vercel 添加环境变量                                │
│    → GITHUB_CLIENT_ID                                │
│    → GITHUB_CLIENT_SECRET                            │
│    → SITE_URL                                        │
│    → GITHUB_REPO                                     │
│ 3. GitHub OAuth App 设置 callback URL                │
│    → https://my-blog-yyyyx.vercel.app/api/auth       │
│ 4. Redeploy 使环境变量生效                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    日常使用                            │
├─────────────────────────────────────────────────────┤
│ 写文章（二选一）：                                     │
│   A. 本地写 .mdx 文件，git push 自动部署              │
│   B. 网页管理面板，点保存，自动触发部署                  │
│                                                      │
│ 修改代码：                                            │
│   git push → Vercel 自动构建部署                      │
└─────────────────────────────────────────────────────┘
```
