---
title: TypeScript 类型收窄：让编译器替你证明
date: 2026-09-19 10:31:00
categories:
  - TypeScript
tags:
  - TypeScript
  - 类型系统
  - 工程化
description: "as 不是类型检查器，是让检查器闭嘴。这篇讲清收窄的六种手段，以及为什么你的 switch 里还需要一个 never 检查。"
cover: /images/covers/typescript-narrowing.svg
---
写 TypeScript 三年之后，你会发现大部分 `as` 都是同一个原因：**你比编译器更早知道了类型，但没有告诉它**。

收窄（narrowing）就是告诉它的正确方式。

## 从最朴素的开始

```ts
type Result =
  | { ok: true; data: string }
  | { ok: false; error: Error };

function unwrap(r: Result) {
  if (r.ok) {
    return r.data;   // 这里 r 被收窄为 { ok: true; data: string }
  }
  throw r.error;     // 这里只剩 { ok: false; error: Error }
}
```

判别字段（discriminant）用字面量类型，是最高效的收窄方式。设计联合类型时，第一件事就是给它一个判别字段。

## 六种收窄手段

1. **typeof** —— 基础类型判断
2. **instanceof** —— 类实例
3. **in** —— 属性存在性
4. **判别字段** —— 字面量联合
5. **自定义类型守卫**（`x is T`）
6. **断言函数**（`asserts x is T`）

自定义守卫值得多说一句：

```ts
function isUser(v: unknown): v is User {
  return (
    typeof v === 'object' && v !== null &&
    'id' in v && typeof (v as User).id === 'string'
  );
}
```

注意 **返回值类型是 `v is User` 而不是 `boolean`**。写成 `boolean`，调用处拿不到任何收窄，等于白写。

## never：让遗漏变成编译错误

```ts
type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'square'; size: number }
  | { kind: 'rect'; w: number; h: number };

function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2;
    case 'square': return s.size ** 2;
    case 'rect':   return s.w * s.h;
    default:
      // 如果将来有人加了 'triangle' 却没改这里，
      // 下面这行会立刻报错，而不是静默返回 undefined
      const _exhaustive: never = s;
      throw new Error('Unhandled shape: ' + JSON.stringify(_exhaustive));
  }
}
```

这是类型系统里最便宜的一道回归测试。

## 一个真实的重构案例

改造前：

```ts
function render(data: any) {
  if (data.type === 'text') return renderText(data.value);
  if (data.type === 'image') return renderImage(data.url);
  return null;
}
```

改造后：

```ts
type Block =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string; alt: string };

function render(block: Block): string {
  switch (block.type) {
    case 'text':  return renderText(block.value);
    case 'image': return renderImage(block.url, block.alt);
  }
}
```

调用处传错字段，编译期就会红。运行时 `null` 分支消失，`?.和 as` 也一起消失。

## 收窄的边界

收窄只在**同一作用域、且值不可变**时可靠。回调函数里的收窄会被编译器丢弃：

```ts
function handle(x: string | null) {
  if (!x) return;

  // ❌ 报错：回调可能在 x 被修改后执行
  setTimeout(() => console.log(x.trim()), 0);

  // ✅ 先存到常量
  const value = x;
  setTimeout(() => console.log(value.trim()), 0);
}
```

理解这一点，你就不会再写无意义的 `!`。

类型不是给编译器看的装饰，它是你写下的、可被机器验证的假设。
