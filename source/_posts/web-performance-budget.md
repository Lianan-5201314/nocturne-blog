---
title: 性能预算：把"感觉慢"变成一条可以报警的红线
date: 2026-08-30 10:45:00
categories:
  - 性能优化
tags:
  - 性能优化
  - CI/CD
  - 工程化
description: "没有预算的性能优化，最后都会输给排期。这篇讲如何用 Lighthouse CI 把 Core Web Vitals 钉在流水线里。"
top_image: /images/covers/web-performance-budget.svg
---
"这个页面有点慢" —— 这句话在评审会上没有杀伤力，因为它无法被反驳，也无法被验证。

性能预算的作用，是把它变成"LCP 超过 2.5s，构建失败"。

## 先定指标，再定阈值

三个核心指标，建议按这个优先级强制：

| 指标 | 含义 | 目标 |
| --- | --- | --- |
| LCP | 最大内容绘制 | < 2.5s |
| CLS | 累积布局偏移 | < 0.1 |
| INP | 交互到下次绘制 | < 200ms |

再加两个资源预算，兜住"悄悄变胖"：

- 首屏 JS gzip 后 < 180KB
- 首屏图片总量 < 500KB

## 用 Lighthouse CI 落地

```bash
npm i -D @lhci/cli
```

`lighthouserc.json`：

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4173/", "http://localhost:4173/post.html?slug=css-layers"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 300 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

跑三次取中位数，避免单次网络抖动造成误报。

## 在 CI 里卡住回归

```yaml
- name: Build
  run: npm run build
- name: Performance budget
  run: npx lhci autorun
```

第一次接入建议先设成 `warn`，观察两周真实分布，再把稳定项升级成 `error`。一上来就 red，团队会习惯性跳过它。

## 三个立刻见效的动作

1. **给图片加尺寸和懒加载**——直接改善 CLS 与 LCP
2. **首屏字体用 `font-display: swap`**——避免文字闪烁
3. **把非关键脚本改成 `defer`**——减少主线程阻塞

> 性能预算真正的作用不是让分数变高，而是让"这次改动值不值得"变成一个有数字可对的讨论。

预算写进 CI 的那天，性能才从"有人在意"变成"项目属性"。
