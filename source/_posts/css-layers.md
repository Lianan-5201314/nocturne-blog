---
title: 用 CSS Cascade Layers 收拾一个失控的样式表
date: 2026-10-05 10:17:00
categories:
  - CSS
tags:
  - CSS
  - 架构
  - 可维护性
description: "!important 越写越多、选择器越写越长，是时候把层叠顺序交还给浏览器了。@layer 能让优先级变成显式契约。"
top_image: /images/covers/css-layers.svg
---
一个项目跑了两年之后，样式表通常会长成三种东西的混合物：组件样式、工具类，以及一堆用来"压过别人"的补丁。

```css
.page .card .card-body .btn.primary {
  background: #7c5cff !important;
}
```

写这行代码的人并不想这样，他只是没有别的办法。

## @layer 把优先级变成声明

```css
@layer reset, base, components, utilities;
```

这一行的意思是：**后声明的层永远赢，与选择器特异性无关**。

于是 utilities 里的一个简单类：

```css
@layer utilities {
  .mt-0 { margin-top: 0; }
}
```

可以稳定地压过 components 里那个写了五个类的复杂选择器：

```css
@layer components {
  .page .card .card-body .title { margin-top: 24px; }
}
```

不需要 `!important`，也不需要提高特异性。层级关系是显式的，是可 review 的。

## 推荐的层结构

```css
@layer reset,
       tokens,
       base,
       layout,
       components,
       utilities,
       overrides;
```

从低到高，语义清晰：

- **reset** —— 抹平浏览器差异
- **tokens** —— 设计变量，几乎不产生规则
- **base** —— 元素默认样式
- **layout** —— 栅格、容器
- **components** —— 组件自己的一亩三分地
- **utilities** —— 单职责工具类，永远能赢
- **overrides** —— 临时补丁层，方便日后清理

## 和第三方库和平共处

这是 @layer 最实用的场景：把 UI 库整个塞进低优先级层。

```css
@import url('vendor-ui.css') layer(vendor);

@layer vendor, components, utilities;
```

库里的 `.button { padding: 8px 16px }` 依然生效，但你的 `.btn-lg` 可以轻松覆盖它，不用再写 `!important` 对抗。

> 一个容易踩的坑：`@import` 必须写在所有规则之前。如果打包器把 CSS 拼接顺序打乱，层顺序可能不是你预期的——显式写一行 `@layer a, b, c;` 声明顺序最保险。

## 渐进增强的写法

老浏览器不认识 `@layer`，会直接忽略整条 at-rule 里的内容（而不是报错崩溃）。所以可以这样兜底：

```css
/* 老浏览器走这条 */
.btn { padding: 10px 20px; }

/* 新浏览器用层来管理 */
@layer components {
  .btn { padding: 10px 20px; }
}
```

代价是重复一次声明，换来的是完全不依赖构建工具的兼容性。

## 迁移顺序建议

不要一次性重写。按这个顺序动，风险最小：

1. 先加一行 `@layer` 声明，什么都不放
2. 把 reset 和 tokens 搬进去
3. 把工具类搬进 utilities，删掉对应的 `!important`
4. 最后处理组件层，一边搬一边删掉为了压优先级而加的选择器

层叠不是敌人。它只是过去缺少一个可以表达"谁该赢"的语法。现在有了。
