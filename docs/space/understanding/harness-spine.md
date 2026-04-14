# Harness Spine

Harness 是 OpenPX 的共享 agent runtime（共享代理运行时）。
它负责 thread 生命周期、命令分发、审批边界、恢复边界、事件流与状态投影。
任何 surface 都只是 harness 的消费者。

## 什么是 harness

harness 不是某一个界面，也不是某一个 adapter。
它是 OpenPX 的系统本体，负责把长期协作、一次执行、审批、恢复和可观察状态组织成可复用的共享执行基座。

在当前代码里，harness 叙事主要落在这些位置：

- `src/runtime/service/runtime-daemon.ts`
  负责复用或启动共享运行时进程
- `src/harness/server/harness-session-registry.ts`
  负责按 scope 组装 harness session
- `src/harness/core/session/harness-session.ts`
  负责 active thread、snapshot 和 live event 的会话拼装
- `src/harness/core/session/session-kernel.ts`
  负责稳定命令边界与会话投影
- `src/app/bootstrap.ts`
  负责控制面装配、run 推进与恢复协同

## 代码落位图

- Harness Core
  `src/harness/core/`
- Protocol
  `src/harness/protocol/`
- App Server
  `src/harness/server/`
- Eval Loop
  `src/harness/eval/`
- TUI Surface
  `src/surfaces/tui/`

## harness core 包含什么

harness core（harness 核心）至少包含以下六类真相职责：

- thread lifecycle
  长期协作线的创建、恢复、切换与持久化
- run and task progression
  一次执行尝试的启动、阻塞、恢复、完成与失败收口
- approval boundary
  高风险动作在真正产生副作用前必须经过人工确认
- recovery boundary
  interrupt、resume、hydrate、replay 等恢复语义必须可重复理解
- projection assembly
  把 durable state（可持久状态）整理成 snapshot 与 session view
- event stream
  向外发布可订阅的状态变化与过程事件

这些职责共同决定了 harness 是系统真相层，而不是某个 surface 内部的实现细节。

## protocol / app server 负责什么

protocol / app server（协议层 / 应用服务层）不是业务真相层，而是 harness 的稳定暴露面。

它的职责是：

- 接收来自 surface 的 command（命令）
- 返回 snapshot 或其他 read model（读模型）
- 发布 event stream 给客户端消费
- 暴露 approval action（审批动作）与 recovery 操作
- 保持客户端协议稳定，避免每个 surface 直接耦合 harness 内部细节

因此，protocol 的价值不在于“多包一层”，而在于为多 surface 提供一致的访问语义。

## surface 为什么不是系统本体

surface 的职责是交互，不是真相。

TUI 目前是默认 surface，但它只负责：

- 接收用户输入
- 呈现 snapshot 与事件
- 触发 protocol 命令
- 承担本地显示状态与交互编排

如果把 TUI 误写为系统本体，会产生三个错误结论：

- 误把 UI state 当成真相状态
- 误把 runtime 视为 TUI 的配套层
- 误把新增 Web / IDE / CLI surface 理解成“再做一套 agent loop”

harness-first 的含义正相反：

- harness 持有真相
- protocol 暴露真相的稳定访问方式
- surface 只是共享 harness 的消费者
