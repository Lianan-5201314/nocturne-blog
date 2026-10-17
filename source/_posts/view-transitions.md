---
title: View Transitions：给多页应用加一点"原生感"
date: 2026-09-28 10:24:00
categories:
  - 交互体验
tags:
  - 动画
  - API
  - 渐进增强
description: "不做 SPA 也能有流畅的页面转场。聊聊 View Transitions API 的原理、降级策略，以及三个容易翻车的细节。"
top_image: /images/covers/view-transitions.svg
---
用户判断一个网站"快不快"，很大程度上取决于**切换瞬间发生了什么**。白屏 300ms 会让人觉得慢，哪怕实际加载只用了 200ms。

View Transitions API 解决的正是这个感知问题。

## 最小可用示例

```js
async function navigate(url) {
  if (!document.startViewTransition) {
    location.href = url;
    return;
  }

  const res = await fetch(url);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  document.startViewTransition(() => {
    document.body.replaceWith(doc.body);
  });
}
```

浏览器会自动做三件事：截取旧状态快照、执行你的 DOM 变更、截取新状态快照，然后在两张快照之间做交叉淡入。

## 给元素命名，才有共享元素动画

默认是整页淡入淡出。想让标题"飞"过去，需要 `view-transition-name`：

```css
.post-title { view-transition-name: post-title; }
.post-cover { view-transition-name: post-cover; }
```

两个页面上同名，浏览器就会把它们当成同一个元素做位移动画。**同一时刻页面上不能有两个同名元素**，否则转场直接失效——这是最常见的翻车点。

## 三个容易翻车的细节

### 1. 滚动位置

转场期间页面被截图，滚动会被重置。记得恢复：

```js
document.startViewTransition(() => {
  document.body.replaceWith(doc.body);
  window.scrollTo(0, 0);
});
```

### 2. 动画时长与可达性

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 320ms;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

前庭功能敏感的用户会因位移动画不适，这段媒体查询不是可选项。

### 3. 别让转场挡住交互

转场期间页面是"活的快照"，用户点击无效。如果 fetch 很慢，先请求再启动转场，不要先启动再等待：

```js
// ✅ 数据就绪后再开始，转场只覆盖 DOM 替换那一瞬
const html = await fetchHtml(url);
document.startViewTransition(() => swap(html));
```

## MPA 版本：一行 CSS

如果站点是多页的，Chromium 已经支持跨文档转场：

```css
@view-transition {
  navigation: auto;
}
```

加到两个页面的 CSS 里，站内跳转自动获得淡入效果。不支持的环境什么都不会发生，天然渐进增强。

体验优化最划算的地方，往往不是让事情变快，而是让等待变得可以被理解。
