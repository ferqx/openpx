# Agent / Mode / AgentRun 重构完成记录

> 状态说明：原 `execution/active/agent-mode-agentrun-refactor.md` 已完成并归档。本文只保留对后续仍有参考价值的完成事实，不再作为 active 执行指令。

## 当时要解决的问题

这轮重构要把 OpenPX 从混杂的 `agent / worker / mode / subagent` 叙事里收出来，明确下面几条正式语义：

- `Build` 是唯一 primary agent。
- `Plan` 是 `Build` 的 `threadMode`，不是第二个 primary agent。
- `AgentRun` 是运行实例语义，不承担产品层 agent 身份。
- TUI 必须把 `Agent / Mode` 与运行实例生命周期分层显示。

## 实际完成

- 建立了 `thread-mode`、primary agent、subagent、system agent 与 registry 的正式类型落点。
- `threadMode` 已进入 thread truth、`ThreadView`、`RuntimeSnapshot` 与 TUI session projection。
- `/plan` 已经通过正式 runtime command 与 `thread.mode_changed` 事件落地，不再依赖消息文本 hack。
- 对外协议和 surface 已统一暴露 `agentRuns` 与 `agent_run.*`，不再把运行实例面板混写成产品层 agent 面板。
- TUI 已拆出 `AgentModeHeader` 与 `AgentRunPanel`，把“当前主代理/模式”和“内部运行实例生命周期”分开显示。

## 验证

- `bun run typecheck`
- `bun test`
- 关键切片覆盖：
  - `tests/interface/agent-mode-header.test.tsx`
  - `tests/runtime/runtime-protocol-schema.test.ts`
  - `tests/runtime/agent-run-lifecycle-protocol.test.ts`
  - `tests/interface/tui-app.test.tsx`

## 已沉淀的稳定结论

- `CONTROL.md` 与 `ARCHITECTURE.md` 已固定 `Build / threadMode / AgentRun` 的正式边界。
- `docs/space/understanding/agent-mode-ontology.md`、`core-concepts.md`、`harness-protocol.md` 已同步新的术语与协议语义。
- `docs/space/execution/active/` 不再保留已经实现完成的设计稿。

## 刻意未做

- 没有引入第二个 primary agent。
- 没有新增新的 thread mode。
- 没有把所有 subagent 都立即实例化成独立运行实例。
