---
title: 关于
date: 2026-10-17 14:20:00
top_image: /images/covers/design-tokens.svg
---

## 关于这个夜色里的笔记本

Nocturne 是一个手写起家的前端技术博客，现在跑在 **Hexo + Stun** 上。没有 CMS，没有后台，只有一堆 Markdown 文件和一条 `hexo generate`。

## 写什么

- **能被验证的实践**：渲染机制、CSS 架构、类型系统、性能预算。每篇都尽量给出可复现的例子与数据，而不是"据说这样更快"。
- **不写什么**：三分钟热点的复述、尚未稳定的 API 搬运。一篇文章如果三个月后就没有价值，它大概不值得写。

## 关于作者

像素，前端开发工程师。白天做设计系统与性能治理，晚上写点关于界面的东西。

相信好的前端是"看不见"的——用户只会觉得顺，而不会注意到你做了什么。

## 这个站怎么搭的

```
hexo-blog/
├── _config.yml          # 站点配置
├── _config.stun.yml     # 主题配置
├── source/
│   ├── _posts/          # 文章（Markdown）
│   ├── images/          # 图标、头像、封面
│   ├── about/index.md
│   ├── categories/index.md
│   └── tags/index.md
└── package.json
```

写新文章：

```bash
npx hexo new post "文章标题"
npm run server   # 本地预览 http://localhost:4000
npm run build    # 生成静态文件到 public/
```

## 联系

- GitHub：[@pixel](https://github.com/)
- 邮箱：[hello@example.com](mailto:hello@example.com)
- RSS：[/atom.xml](/atom.xml)
