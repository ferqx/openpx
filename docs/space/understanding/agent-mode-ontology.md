# Agent / Mode / AgentRun Ontology

本文档用于固定 OpenPX 当前已经落地的协作语义分层，避免再次把 `agent / worker / mode / subagent` 混写成一团。

## 一句话结论

当前 v1 的正式产品层语义是：

- 唯一 primary agent（主代理）：`Build`
- 唯一 thread mode（线程模式）：`normal | plan`
- 正式 subagent（子代理合同）：`Explore / Verify / Review / General`
- 正式 system agent（系统代理合同）：`Compaction / Summary / Title / MemoryMaintainer`
- runtime instance（运行时实例）：`AgentRun`

## Primary Agent

`Build` 是当前唯一 primary agent。

- 代码落点：`src/control/agents/agent-spec.ts`
- UI 投影：`src/surfaces/tui/components/agent-mode-header.tsx`
- 当前默认值：`DEFAULT_PRIMARY_AGENT_ID = "build"`

这意味着：

- 默认线程始终由 `Build` 工作
- 当前不提供与 `Build` 对称切换的第二个主代理
- TUI 顶部显示的是 `Agent: Build`，不是“当前 worker 是谁”

## Thread Mode

`Mode` 不是新的 agent，而是 primary agent 在当前 thread 上的工作方式切换。

当前只存在两种 thread mode：

- `normal`
- `plan`

主要代码落点：

- 定义：`src/control/agents/thread-mode.ts`
- thread truth：`src/domain/thread.ts`
- 持久化：`src/persistence/sqlite/sqlite-thread-store.ts`
- 协议投影：`src/harness/protocol/views/thread-view.ts`
- snapshot 投影：`src/harness/protocol/views/runtime-snapshot-schema.ts`
- 事件：`src/harness/protocol/events/runtime-event-schema.ts`

### `/plan` 的正式语义

`/plan` 不再是文本 hack（文本技巧），而是 thread-level mode toggle（线程级模式切换）：

- TUI 普通输入会显式清回 `normal`
- TUI `/plan` 输入会先切到 `plan`
- mode 变化会发布 `thread.mode_changed`
- `plan` mode 下 run-loop 先要求 planner 生成可执行方案，然后继续推进 execute / verify / respond

`plan` mode 的默认合同是：

- 先产出实现计划，再执行可落地的工作包
- 如果关键产品或技术细节缺失，TUI 显示 `planDecision` 方案选择卡片，让用户用数字选择 2-4 个具体方案之一
- 方案选择不是普通新提交；它会持久化为 `waiting_plan_decision` suspension（挂起），用户选择后通过 `plan_decision` continuation（继续执行信封）恢复原 run
- `plan_decision` continuation 会携带原始请求、所选方案与 continuation（继续执行说明），并回到 planner 重新生成可执行工作包
- 普通寒暄或知识问答仍可走 `respond_only`，不应虚构文件改动

`plan decision` 与 `approval` 的区别必须保持清楚：

- `approval` 是风险控制与操作许可，回答“是否允许执行这个动作”
- `plan decision` 是方案选择与路径决定，回答“接下来按哪个方案继续”

两者都可能暂停 run，但 `plan decision` 不属于自动恢复边界；
用户显式选择后才通过 `plan_decision` continuation 恢复原 run。

## Subagent Contracts

当前已经有正式子代理合同，但它们首先是合同，不要求立刻都实体化成独立实例。

- `Explore`
- `Verify`
- `Review`
- `General`

代码落点：`src/control/agents/subagent-spec.ts`

这些语义用于表达“Build 可以按需调用什么专业协作单元”，而不是表达当前 runtime 里是否已经起了一个实例。

当前 `SubagentSpec` 已经是最小合同对象，包含：

- `permissionPolicy`：权限边界
- `visibilityPolicy`：实例可见性边界
- `invocationPolicy`：调用边界
- `costLabel`：成本归因标签

四个默认合同固定为：

- `Explore`：`readonly_search` / `hidden` / `automatic_only` / `explore`
- `Verify`：`verification_only` / `visible_when_instance` / `hybrid` / `verify`
- `Review`：`readonly_review` / `hidden` / `automatic_only` / `review`
- `General`：`inherited_minimum` / `hidden` / `automatic_only` / `general`

`Verify` 是当前第一个有明确实例化边界的 subagent：

- 轻量、单轮、无需独立取消或观察的验证只是 run-loop 逻辑子阶段
- 多轮、长耗时、需要独立取消、用户需要观察、成本显著，或失败后值得单独复盘的验证，应实例化为 `roleKind=subagent`, `roleId=verify`
- 当前底层若通过 `verifier` runtime role 执行，也必须投影为正式的 `roleKind=subagent`, `roleId=verify`

## System Agent Contracts

系统代理只服务内部维护，默认不作为用户主要工作对象。

- `Compaction`
- `Summary`
- `Title`
- `MemoryMaintainer`

代码落点：`src/control/agents/system-agent-spec.ts`

## AgentRun

`AgentRun` 是运行时实例概念，不是产品层主语。

它负责表达：

- 某个内部执行单元是否真的被拉起
- 当前状态是 `running / paused / completed / failed / cancelled`
- 是否有 `resumeToken`
- 为什么被拉起（`spawnReason`）

正式代码落点：

- domain：`src/domain/agent-run.ts`
- runtime role 适配：`src/control/agents/agent-run-adapter.ts`
- 协议视图：`src/harness/protocol/views/agent-run-view.ts`
- TUI 生命周期面板：`src/surfaces/tui/components/agent-run-panel.tsx`

当前协议边界是：

- `RuntimeSnapshot` 和 `thread.view_updated` 正式提供 `agentRuns`
- 新 UI 组件直接消费 `AgentRunView`
- runtime protocol 的生命周期命令与事件使用 `agent_run_*` / `agent_run.*`
- 内部 store、manager、SQLite 与 TUI 也统一使用 `agentRun*` 命名

## UI 分层

当前 UI 应同时表达三件不同的事：

1. 当前 primary agent 是谁
2. 当前 thread mode 是什么
3. 当前有哪些内部 AgentRun 实例正在运行

对应落点：

- `Agent / Mode` 头部：`src/surfaces/tui/components/agent-mode-header.tsx`
- thread 列表：`src/surfaces/tui/components/thread-panel.tsx`
- sessions 面板：`src/surfaces/tui/components/utility-pane.tsx`
- AgentRun 生命周期面板：`src/surfaces/tui/components/agent-run-panel.tsx`

因此不能再把 `AgentRun` 面板当作产品层 agent 面板。

## 当前边界

当前仓库已经把运行实例主命名统一到 `AgentRun`。

因此当前应这样理解：

- `AgentRun`
  当前正式运行实例术语，用来说明这些实例真正代表的是 runtime lifecycle，而不是 primary agent 本体
- `planner / executor / verifier / memory_maintainer`
  当前保留的旧 runtime role 字面量，用来表达内部执行分工

只要这条解释仍成立，就不应再把 `AgentRun` 叙述成“用户当前选中的 agent”。
