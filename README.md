# Nocturne · 深夜编码手记

基于 [Hexo 6](https://hexo.io/) + [Stun 2.8](https://github.com/liuyib/hexo-theme-stun) 的个人技术博客。
纯静态输出，无需数据库，任何静态托管都能跑。

- 在线站点：https://nocturne-blog.app.workbuddy.host/
- 主题能力：夜间模式、文章目录、阅读进度、字数/阅读时长、站内搜索、RSS、分类与标签、CC BY-NC-SA 版权
- 所有前端依赖（FontAwesome / jQuery / Velocity）已自托管在 `source/vendor/`，**不请求 jsDelivr**

## 目录结构

```
.
├─ _config.yml            # 站点配置：标题、作者、url、永久链接
├─ _config.stun.yml       # 主题配置：导航、侧栏、目录、搜索、配色
├─ scaffolds/             # hexo new 生成文章/页面的模板
├─ source/
│  ├─ _posts/             # 文章 Markdown（正文都在这）
│  ├─ about/              # 关于页
│  ├─ categories/ tags/   # 分类页、标签页
│  ├─ images/             # 头像、favicon、文章封面
│  └─ vendor/             # 自托管的前端依赖
├─ .github/workflows/     # GitHub Pages 自动部署
└─ .gitignore             # 忽略 node_modules / public / db.json
```

## 本地开发

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

会生成 `source/_posts/文章标题.md`，填写 front-matter：

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
top_image: /images/covers/xxx.svg   # 可选，文章头图
---
```

> `description` 的值**建议加引号**。像 `!important` 开头或在里面出现 `: ` 的句子，不加引号会被 YAML 当成标签或键值对，构建直接报错。

## 部署

### 方式一：GitHub Pages（推荐，push 即上线）

1. 在 GitHub 建一个空仓库，例如 `nocturne-blog`（不要勾选 README）。
2. 关联并推送：

```bash
git remote add origin git@github.com:<你的用户名>/nocturne-blog.git
git push -u origin main
```

3. 仓库 **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`**。
4. 之后每次 `git push`，`.github/workflows/deploy.yml` 会自动 `npm ci` + `hexo generate` 并发布。

访问地址：

- 仓库名叫 `<用户名>.github.io` → `https://<用户名>.github.io/`
- 其他名字（项目页）→ `https://<用户名>.github.io/<仓库名>/`

工作流会自动识别这两种情况并改写 `url` 与 `root`，**不需要手动改 `_config.yml`**。
如果改了仓库名，记得在 Actions 里重新跑一次（Actions → Deploy Hexo to GitHub Pages → Run workflow）。

### 方式二：Gitee Pages

```bash
git remote add origin git@gitee.com:<你的用户名>/nocturne-blog.git
git push -u origin main
```

Gitee 的 Pages 服务需要在仓库页面 **服务 → Gitee Pages** 里手动开启/更新（默认分支根目录或 `docs/`），
因此需要把构建产物一起提交，或改用 `gh-pages` 分支：

```bash
npx hexo generate
cd public && git init && git add -A && git commit -m "deploy" \
  && git push -f git@gitee.com:<你的用户名>/nocturne-blog.git main:gh-pages
```

### 方式三：手动推到任意仓库的 gh-pages 分支

编辑 `_config.yml`：

```yaml
deploy:
  type: git
  repo: git@github.com:<你的用户名>/nocturne-blog.git
  branch: gh-pages
```

然后 `npm run deploy`（`hexo-deployer-git` 已装好，会把 `public/` 推到该分支）。

### 绑定自己的域名（例如 xwhy.live）

1. `source/CNAME` 新建文件，内容只有一行：`xwhy.live`
2. 在域名服务商添加解析：
   - 根域名 `xwhy.live` → 4 条 A 记录指向 `185.199.108.153` / `185.199.109.153` / `185.199.110.153` / `185.199.111.153`
   - `www` → CNAME 指向 `<你的用户名>.github.io`
3. 把 `_config.yml` 的 `url` 改成 `https://xwhy.live`，push。
4. 仓库 Settings → Pages → Custom domain 填 `xwhy.live`，勾选 Enforce HTTPS。

Gitee Pages 的自定义域名需要会员，且国内域名需先完成 ICP 备案。

## 常见坑

| 现象 | 原因 |
|---|---|
| 页面没样式，控制台 404 `/css/...` | `root` 与部署路径不匹配（项目页需要 `/仓库名/`），见方式一的自动处理 |
| 构建报 `duplicated mapping key` | `_config.stun.yml` 里同一个键写了两次（如两个 `cdn:`） |
| 构建报 YAML 错误 | `description` 未加引号且含 `:` / 以 `!` 开头 |
| GitHub Actions 成功但页面 404 | Settings → Pages 的 Source 还没切到 `GitHub Actions` |
| 订阅/分享链接指向旧域名 | 改完 `_config.yml` 的 `url` 后要重新 `hexo generate` |

## 许可

文章内容采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh) 协议。
