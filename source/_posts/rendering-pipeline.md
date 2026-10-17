---
title: 把一帧画面拆开看：浏览器渲染流水线完全指南
date: 2026-10-12 10:10:00
categories:
  - 浏览器原理
tags:
  - 性能优化
  - 渲染
  - DevTools
description: "从 HTML 字节流到屏幕上的像素，中间到底发生了什么？我们用一张图、五个阶段，加上真实的 DevTools 证据，把渲染流水线讲透。"
top_image: /images/covers/rendering-pipeline.svg
---
几乎每一次"页面怎么这么卡"的讨论，最后都会落到同一个问题上：**你到底在第几步花了时间？**

渲染流水线并不是一个抽象的比喻，它是一条真实存在、可以被逐帧观测的链路。理解它，你就不需要靠猜来优化性能。

## 五个阶段，一条流水线

从按下回车到看见像素，浏览器大致会经历：

1. **Parse** —— 字节流变成 DOM，CSS 变成 CSSOM
2. **Style** —— 为每个节点计算最终样式（Recalculate Style）
3. **Layout** —— 计算几何位置，输出盒模型坐标
4. **Paint** —— 填充像素，生成绘制指令
5. **Composite** —— 分层合成，交给 GPU 上屏

关键在于：**后面的阶段依赖前面的阶段**。你改一个属性，触发的阶段越靠后，代价越小。

## 三种改动，三种代价

| 你改了什么 | 触发的阶段 | 代价 |
| --- | --- | --- |
| `width`、`top`、字体大小 | Layout → Paint → Composite | 最贵 |
| `background-color`、`box-shadow` | Paint → Composite | 中等 |
| `transform`、`opacity` | Composite | 最便宜 |

所以动画优先用 `transform` 和 `opacity`，不是为了"玄学更丝滑"，而是因为它们真的跳过了前两个阶段。

```css
/* 会触发 Layout 的写法 */
.card:hover { left: 4px; }

/* 只走合成层的写法 */
.card {
  transition: transform 240ms cubic-bezier(.22,.61,.36,1);
  will-change: transform;
}
.card:hover { transform: translate3d(0, -4px, 0); }
```

> 注意：`will-change` 是一把双刃剑。它会让元素提前被提升为合成层，滥用会吃掉显存，反而拖慢整体帧率。只在真正会动的元素上加，动画结束后考虑移除。

## 强制同步布局：最隐蔽的性能杀手

有一种写法看起来无害，却会让浏览器在同一帧里反复重排：

```js
// 每轮循环都在强制 Layout
for (const el of list) {
  el.style.width = el.offsetWidth + 10 + 'px';
}
```

读取 `offsetWidth` 会强制浏览器"立刻"把待处理的样式变更刷新成布局结果。写在循环里，就是 O(n) 次同步布局。

修法很简单：**先读后写**。

```js
// 1. 一次性读完
const widths = list.map((el) => el.offsetWidth);
// 2. 再统一写
list.forEach((el, i) => { el.style.width = widths[i] + 10 + 'px'; });
```

## 怎么用 DevTools 抓到真凶

打开 Performance 面板，录制一段交互，然后看主线程的火焰图：

- 黄色块里出现紫色的 **Layout**，说明重排了
- 绿色 **Paint** 密集出现，说明绘制压力大
- 底部 **Frames** 出现红色三角，那一帧就超时了（>16.7ms）

把时间花在读数上，而不是花在猜上。

## 一张检查清单

- 动画只用 `transform` / `opacity`
- 不在循环里混用读写 DOM
- 长列表用虚拟滚动，而不是 `display: none` 隐藏
- 图片给足 `width` / `height`，避免布局抖动（CLS）
- 离屏内容用 `content-visibility: auto` 跳过渲染

渲染没有魔法，只有阶段与代价。把这两件事记住，性能问题就变成了一道可以算的题。
