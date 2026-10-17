# Nocturne · 深夜编码手记

基于 [Hexo 7](https://hexo.io/) + [ShokaX 0.5](https://github.com/theme-shoka-x/hexo-theme-shokaX) 的个人技术博客。
纯静态输出，无需数据库，任何静态托管都能跑。

- 在线站点：https://nocturne-blog.app.workbuddy.host/
- 仓库：https://github.com/Lianan-5201314/nocturne-blog
- 主题能力：亮/暗双模式（可按时间自动切换）、首页六宫格头图、文章目录、阅读进度、字数统计、分类与标签云、Atom/RSS/JSON Feed、KaTeX 公式、代码块复制
- 前端依赖走 `at.alicdn.com` / `s4.zstatic.net` 两个国内可达 CDN，字体不加载 Google Fonts

## 目录结构

```
.
├─ _config.yml            # Hexo 配置：标题、作者、url、永久链接、markdown 渲染、feed
├─ _config.shokax.yml     # 主题配置：导航、侧栏、颜色、模块开关（与主题默认值合并）
├─ scaffolds/             # hexo new 生成文章的模板
├─ tools/
│  └─ set-site-root.js    # CI 里按仓库形态改写 url / root（不要放进 scripts/）
├─ source/
│  ├─ _posts/             # 文章 Markdown
│  ├─ _data/
│  │  ├─ assets/          # 头像等会被复制到 /assets/ 的图片
│  │  ├─ images.yml       # 文章无 cover 时的兜底图（≥ 6 张，否则首页构建失败）
│  │  └─ images_index.yml # 首页六宫格头图（≥ 6 张）
│  ├─ about/              # 关于页
│  ├─ categories/ tags/   # 分类页、标签页
│  └─ images/             # favicon、文章封面
├─ .github/workflows/     # GitHub Pages 自动部署
└─ .gitignore             # 忽略 node_modules / public / db.json
```

> `scripts/` 这个目录名在 Hexo 里是**插件目录**，放进去的任意 `.js` 都会被当作插件加载。
> 一旦里面有带 shebang 的普通脚本，构建会报 `Script load failed` 并且首页生成为 0 字节，所以工具脚本放在 `tools/`。

## 本地开发

需要 **Node.js ≥ 20**（ShokaX 的硬性要求）。

```bash
npm install          # 首次
npm run server       # http://localhost:4000
npm run build        # 生成静态文件到 public/
npm run clean        # 清理缓存
```

## 写一篇新文章

```bash
npx hexo new post "文章标题"
```

`source/_posts/文章标题.md` 的 front-matter：

```yaml
---
title: 文章标题
date: 2026-10-20 10:00:00
categories:
  - CSS
tags:
  - CSS
  - 布局
description: "列表页摘要与搜索结果里显示的这句话"
cover: /images/covers/xxx.svg   # 文章头图，留空则从 images.yml 随机取
---
```

- 摘要分隔用 `<!-- more -->`，分隔符之前的内容会显示在首页卡片上。
- `description` 建议加引号：以 `!` 开头或含 `: ` 的句子不加引号，YAML 会解析失败。
- 数学公式用 `$$ ... $$`，主题内置 KaTeX。

## 部署

### 方式一：GitHub Pages（push 即上线）

`.github/workflows/deploy.yml` 会在每次 push 到 `main` 时自动构建并发布：

1. 仓库 **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`**（工作流里已开 `enablement: true`，多数情况下会自动完成）。
2. 访问地址：
   - 仓库名 `<用户名>.github.io` → `https://<用户名>.github.io/`
   - 其他名字（项目页）→ `https://<用户名>.github.io/<仓库名>/`

工作流会调用 `tools/set-site-root.js` 自动改写 `url` 与 `root`，**不需要手动改 `_config.yml`**；如果放了 `source/CNAME`，则自动改用自定义域名。

> 私有仓库（Private）不能使用 GitHub Pages，免费账号必须把仓库设为 Public。

### 方式二：任意静态托管

`npm run build` 后把 `public/` 整个目录上传到 Vercel / Netlify / Cloudflare Pages / 对象存储即可，无服务端依赖。

### 绑定自己的域名（例如 xwhy.live）

1. `source/CNAME` 写入一行：`xwhy.live`
2. 域名解析：根域名加 4 条 A 记录 `185.199.108.153` / `185.199.109.153` / `185.199.110.153` / `185.199.111.153`；`www` 用 CNAME 指向 `<用户名>.github.io`
3. 仓库 Settings → Pages → Custom domain 填 `xwhy.live`，勾选 Enforce HTTPS

## 常见坑

| 现象 | 原因与处理 |
|---|---|
| 首页/归档页生成为 0 字节，日志说 `image_list must have at least 6 items` | `source/_data/images_index.yml`（或 `images.yml`）少于 6 条，补齐即可 |
| `[SXEC 102] Critical rendering plugins are missing` | `package.json` 的 dependencies 里必须显式声明 `shokax-uikit`、`hexo-renderer-aether`、`nyx-player`，只装在 node_modules 里不算 |
| `[SXEC 101] Highlight.js or Prismjs enabled` | `_config.yml` 里 `syntax_highlighter: false`，代码高亮由主题接管 |
| 构建报 `Script load failed: scripts/xxx.js` | `scripts/` 被当成插件目录，工具脚本挪到 `tools/` |
| 页面没样式、控制台 404 `/css/...` | `root` 与部署路径不匹配（项目页需要 `/<仓库名>/`），交给 `tools/set-site-root.js` 处理 |
| GitHub Actions 成功但页面 404 | Settings → Pages 的 Source 还没切到 `GitHub Actions` |
| `ssh: connect to host github.com port 22: Connection refused` | 用 443：`~/.ssh/config` 写 `Host github.com` / `HostName ssh.github.com` / `Port 443` |
| 想开站内搜索 | 主题用 Pagefind，需要 `hexo generate` 之后额外跑一次 `pagefind --site public`，再把 `_config.shokax.yml` 的 `pagefind.enable` 设为 `true` |

## 许可

- 文章内容：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)
- 主题 ShokaX：AGPL-3.0-or-later（含[附加使用限制](https://github.com/theme-shoka-x/hexo-theme-shokaX/blob/main/UsageRestrictions.md)）
