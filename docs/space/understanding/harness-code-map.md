# Harness 代码对照

这份文档回答一个问题：

OpenPX 在代码里如何落成 harness-first（以 harness 为先）结构。

## Harness Core

Harness Core 负责 thread（线程）、session（会话）、projection（投影视图）、command boundary（命令边界）和 live event flow（实时事件流）。

当前代码锚点：

- `src/harness/core/session/harness-session.ts`
  scope（作用域）级 harness session，负责 active thread、snapshot projection 与 live event stream
- `src/harness/core/session/session-kernel.ts`
  stable command boundary，负责 `submit / approve / reject / hydrateSession`

## Harness Protocol

Harness Protocol 定义 surface（交互表面）与 harness 之间的稳定契约。

当前代码锚点：

- `src/harness/protocol/schemas/api-schema.ts`
- `src/harness/protocol/commands/runtime-command-schema.ts`
- `src/harness/protocol/events/runtime-event-schema.ts`
- `src/harness/protocol/views/*`

## Harness App Server

Harness App Server 负责把 protocol 暴露给 surface。

当前代码锚点：

- `src/harness/server/harness-session-registry.ts`
- `src/harness/server/http/runtime-router.ts`
- `src/harness/server/http/runtime-http-server.ts`

## Surfaces

Surface 是 harness 的消费者，不持有系统真相。

当前默认 surface：

- `src/surfaces/tui/runtime/runtime-client.ts`
- `src/surfaces/tui/runtime/remote-kernel.ts`
- `src/surfaces/tui/app.tsx`

## Harness Eval Loop

Harness Eval Loop 负责把真实运行行为转成 trace（运行轨迹）、规则评估、review queue（分诊队列）与 promotion guardrail（晋升护栏）。

当前代码锚点：

- `src/harness/eval/real/trace.ts`
- `src/harness/eval/real/evaluation.ts`
- `src/harness/eval/real/review-queue.ts`
- `src/harness/eval/real/promotion.ts`
- `src/harness/eval/real/replay.ts`
