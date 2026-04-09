# TUI 极简重构与性能优化实施计划

Date: 2026-04-05
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This implementation plan is preserved as historical shell-performance exploration, not as an active baseline.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 openpx TUI 界面为极简风格，并将后端任务执行改为异步模式以实现 < 1s 的即时响应，同时区分展示服务延迟与模型推理时间。

**Architecture:** 
1. **异步命令处理**：`SessionKernel` 立即返回任务引用，后台运行 Graph。
2. **事件驱动 UI**：TUI 通过 SSE 实时接收 `task.created`、`model.invocation_started` 等事件进行增量更新。
3. **极简 UI 组件**：参考 Claude Code 风格，移除冗余面板和标签。

**Tech Stack:** TypeScript, React (Ink), LangGraph, SSE

---

### Task 1: 后端异步命令处理重构

**Files:**
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Test: `tests/kernel/session-kernel.test.ts`

- [ ] **Step 1: 修改 SessionKernel.handleCommand 为异步非阻塞**

```typescript
// 修改 src/kernel/session-kernel.ts 中的 handleCommand
// 不再 await deps.controlPlane.startRootTask，而是启动一个后台 Promise
async handleCommand(command, expectedRevision) {
  if (command.type === "submit_input") {
    // ... 获取 threadId ...
    // 立即启动后台任务，不等待返回
    void (async () => {
      try {
        const result = await deps.controlPlane.startRootTask(threadId, command.payload.text);
        await finalize(threadId, result);
      } catch (error) {
        console.error("Background task failed", error);
        // 发布失败事件
      }
    })();

    // 立即返回当前线程状态
    return this.hydrateSession(); 
  }
}
```

- [ ] **Step 2: 更新 RuntimeCommandHandler 以支持 202 状态码概念**

```typescript
// src/runtime/service/runtime-command-handler.ts
if (command.kind === "add_task") {
  await deps.ensureActiveThread();
  const result = await deps.context.kernel.handleCommand({
    type: "submit_input",
    payload: { text: command.content },
  });
  // 这里不再同步等待 50s，而是立即获得 hydrate 后的 session
  return result; 
}
```

- [ ] **Step 3: 运行现有测试确保不破坏核心逻辑**

Run: `bun test tests/kernel/session-kernel.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/kernel/session-kernel.ts src/runtime/service/runtime-command-handler.ts
git commit -m "feat: make session kernel command handling asynchronous"
```

---

### Task 2: 性能指标打点与事件增强

**Files:**
- Modify: `src/kernel/event-bus.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/infra/model-gateway.ts`

- [ ] **Step 1: 在 Event 类型中增加性能打点事件**

```typescript
// src/kernel/event-bus.ts
export type KernelEvent = 
  | { type: "model.invocation_started"; payload: { timestamp: number } }
  | { type: "model.first_token_received"; payload: { timestamp: number } }
  | { type: "model.completed"; payload: { timestamp: number, duration: number } }
  // ... 其他现有事件 ...
```

- [ ] **Step 2: 在 ModelGateway 中实现状态打点**

```typescript
// src/infra/model-gateway.ts
// 在请求模型 API 前后发送事件
```

- [ ] **Step 3: 更新 bootstrap.ts 关联模型状态与内核事件**

- [ ] **Step 4: Commit**

```bash
git add src/kernel/event-bus.ts src/infra/model-gateway.ts src/app/bootstrap.ts
git commit -m "feat: add performance tracking events for model latency"
```

---

### Task 3: TUI 基础布局极简重构

**Files:**
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/status-bar.tsx`

- [ ] **Step 1: 默认隐藏 ThreadPanel**

```typescript
// src/interface/tui/screen.tsx
// 仅在有特定指令或状态时显示 ThreadPanel，释放空间
```

- [ ] **Step 2: 简化 Header 和移除主体边框**

```typescript
// src/interface/tui/screen.tsx
// 移除 Box 的 borderStyle="single" 等装饰
```

- [ ] **Step 3: 压缩 StatusBar 信息并增加计时器**

```typescript
// src/interface/tui/components/status-bar.tsx
// 实时展示 Wait: Xs | Gen: Xs
```

- [ ] **Step 4: Commit**

```bash
git add src/interface/tui/screen.tsx src/interface/tui/components/status-bar.tsx
git commit -m "ui: simplify TUI layout and status bar"
```

---

### Task 4: 交互流重构与流式回复

**Files:**
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/tui/components/composer.tsx`

- [ ] **Step 1: 移除 "Agent:" 标签和多余间距**

- [ ] **Step 2: 使用 ❯ 提示符渲染用户消息**

- [ ] **Step 3: 实现弱化的工具执行显示**

```typescript
// 渲染 tool.executed 时使用灰色和缩进
<Text color="gray">  ◌ Executing tool...</Text>
```

- [ ] **Step 4: 整合性能指标到正在进行的任务状态中**

- [ ] **Step 5: 运行 TUI 冒烟测试**

Run: `bun run src/app/main.ts` (手动验证界面)
Expected: UI 响应迅速，布局清新，符合极简风格。

- [ ] **Step 6: Commit**

```bash
git add src/interface/tui/components/interaction-stream.tsx
git commit -m "ui: refactor interaction stream for minimalist feel"
```
