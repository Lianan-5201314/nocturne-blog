---
title: 设计变量不是 CSS 变量换个名字
date: 2026-09-08 10:38:00
categories:
  - 设计工程
tags:
  - CSS
  - 设计系统
  - 架构
description: "很多团队抄了一套 token 命名，却没抄到背后的抽象层级。这篇文章给出一个能撑住三年的 token 结构。"
top_image: /images/covers/design-tokens.svg
---
`--color-primary` 是最容易被滥用的变量名。它的问题不是不好用，而是**它把决策和取值绑死了**。

## 三层结构

一个能长期维护的 token 体系，通常有三层：

### 1. 原始值（primitive）

只描述"这是什么颜色"，不带语义。

```css
--color-violet-500: #7c5cff;
--color-cyan-400: #22d3ee;
--color-slate-950: #0a0b10;
```

这一层不直接被组件使用。

### 2. 语义层（semantic）

描述"用在哪里"。

```css
--surface-base: var(--color-slate-950);
--surface-raised: #12141c;
--text-primary: #eef1f8;
--text-muted: #98a2b8;
--accent: var(--color-violet-500);
--border-subtle: rgba(255,255,255,.08);
```

### 3. 组件层（component）

只在必要时存在，用来说明"这个组件怎么用语义 token"。

```css
--card-bg: var(--surface-raised);
--card-border: var(--border-subtle);
--card-radius: 16px;
```

## 为什么不能只有一层

假设你只有 `--color-primary`。有三处需要"稍微淡一点的边框"，你怎么命名？

- `--color-primary-10`？
- `--border-light`？
- `--color-gray-800`？

没有语义层，命名就会开始描述**程度**而不是**用途**，很快就没人知道该用哪个了。

而有了 `--border-subtle`，深浅调整只发生在一个地方。

## 暗色主题不是反色

换肤最常见的错误做法，是把所有颜色取反。结果通常是：纯黑背景 + 纯白文字，对比度过高，长时间阅读眼睛疼。

正确的做法是在语义层做映射：

```css
:root {
  --surface-base: #f7f7f9;
  --text-primary: #14161c;
  --text-muted: #5b6472;
  --accent: #6d4aff;
}

[data-theme='dark'] {
  --surface-base: #0a0b10;   /* 不是 #000 */
  --text-primary: #eef1f8;   /* 不是 #fff */
  --text-muted: #98a2b8;
  --accent: #8b74ff;         /* 暗底上提亮，保证对比度 */
}
```

组件完全不感知主题，只引用语义 token。

## 增量落地

不要为了 token 化停下来两周做重构。可以这样切：

1. 把现有硬编码颜色按出现频次排序，取前 20 个
2. 为它们建立语义名，先在旧代码里引入变量但保持取值不变
3. 新代码强制走 token，旧代码在改动时顺手迁移
4. 加一条 lint 规则：组件 CSS 里出现十六进制颜色就警告

半年之后，你会发现换主题只需要改二十行。
