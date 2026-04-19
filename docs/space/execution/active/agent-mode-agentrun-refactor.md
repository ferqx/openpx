# Agent / Mode / AgentRun 重构方案

## Summary

本次重构的目标，是把 OpenPX 当前混杂的 `agent / worker / mode / subagent` 语义拆清楚，并把新的产品层定义落实到 truth、protocol、runtime、UI、文档和测试层。

当前主分支已经具备正式的 worker 实例体系，但该体系表达的主要是生命周期，而不是产品层角色语义：

* `WorkerRole` 目前仍是 `planner / executor / verifier / memory_maintainer`，偏 internal/runtime 分工，而不是产品层角色集合。
* `worker-manager` 的职责是 `spawn / inspect / resume / cancel / join`，核心是生命周期壳，不是角色合同层。
* `worker-panel` 只显示 `role [status] spawnReason`，更像内部执行单元视图，不像产品层 agent 面板。
* `ThreadView` 与 `RuntimeSnapshot` 目前都没有 `threadMode` 语义。
* `RuntimeSessionState` 也还没有 `primaryAgent / threadMode` 投影。

这会导致后续能力建设反复陷入这些问题：

* `Plan` 到底是 agent、worker，还是命令模式？
* `Verify` 是角色合同、子代理，还是实例对象？
* `worker-panel` 到底是不是用户层 agent 面板？
* `/plan` 到底是消息文本、命令，还是线程状态？

本方案的核心决策是：

1. `Build` 是唯一 primary agent
2. `Plan` 不是第二个 primary agent，而是 `Build` 的 thread mode
3. `Explore / Verify / Review / General` 是 subagent contracts
4. 当前 `worker` 重构为 `AgentRun`，作为 runtime instance
5. UI 中必须把 `Agent / Mode` 和 `AgentRun lifecycle` 分层显示
6. `/plan` 必须落成 thread-level mode toggle，而不是消息文本 hack

---

## Goals

本轮重构完成后，系统必须具备下面这些稳定语义。

### 产品层

* 唯一 primary agent：`Build`
* 唯一线程模式：`normal | plan`
* 正式 subagents：`Explore / Verify / Review / General`
* 正式 system agents：`Compaction / Summary / Title / MemoryMaintainer`

### 运行时层

* `AgentRun` 取代当前 `worker` 作为运行时实例概念
* `AgentRun` 负责生命周期、实例追踪、取消/恢复/完成，而不是承担产品层 agent 本体语义

### 交互层

* 默认线程始终使用 `Build`
* 输入 `/plan` 后，当前线程进入 `plan` mode
* 移除 `/plan` 后，线程恢复 `normal`
* 不提供 `/build`

### 协议层

* `threadMode` 进入 thread truth
* `threadMode` 进入 `ThreadView`
* `threadMode` 进入 `RuntimeSnapshot`
* 存在正式事件：`thread.mode_changed`

### UI 层

* 主界面明确显示：

  * `Agent: Build`
  * `Mode: normal | plan`
* `worker-panel` 不再承担产品层 agent 面板职责
* 实例视图重命名/重定位为 `AgentRun` 视图或 internal lifecycle 视图

---

## Non-Goals

本轮重构明确不做以下事情：

* 不引入第二个 primary agent
* 不把 `Plan` 做成独立 thread
* 不默认为 `Plan` 生成独立运行实例
* 不把所有 subagent 都立即实例化为 `AgentRun`
* 不在本轮统一 tool-calling、多 provider 或复杂 orchestration
* 不把 UI polish 当成主线
* 不为了术语统一而立刻推倒所有旧 runtime 逻辑

---

## Final Ontology

### Primary Agent

* `Build`

### Thread Mode

* `normal`
* `plan`

### Subagents

* `Explore`
* `Verify`
* `Review`
* `General`

### System Agents

* `Compaction`
* `Summary`
* `Title`
* `MemoryMaintainer`

### Runtime Instance

* `AgentRun`

---

## Formal Definitions

### Agent

Agent 是一个带有明确目标、独立上下文边界、独立权限边界、明确调用方式和可追踪生命周期的协作单元。

在 `v1` 中，产品层唯一的 primary agent 是 `Build`。

### Mode

Mode 是 primary agent 在某个 thread 内的工作方式切换。
Mode 不是新的 agent，不独立存在，只附着在 thread 上。

在 `v1` 中，唯一的 thread mode 是：

* `normal`
* `plan`

### Subagent

Subagent 是由 primary agent 按需调用、用于完成特定子任务的专门代理。
它们先作为合同存在，不要求立即都实体化为实例对象。

### System Agent

System agent 是只服务系统内部维护的隐藏代理。
默认不作为用户工作对象出现。

### AgentRun

AgentRun 是某个 agent / subagent / system agent 在某次 thread/run/task 中被实例化后产生的运行时对象。
它负责表达：

* 是否被真正拉起
* 当前状态
* 是否暂停/恢复/取消/完成
* 输入/输出摘要
* 是否用户可见
* 是否值得复盘

---

## Key Design Decision: Why Plan Is a Mode

`Plan` 在 OpenPX `v1` 中应定义为 mode，而不是第二个 primary agent。

原因如下：

### 1. 交互事实决定了它更像 mode

已经明确的交互是：

* 默认始终使用 `Build`
* `/plan` 进入计划状态
* 删除 `/plan` 自动恢复默认
* 不提供 `/build`

这说明 `Plan` 不是一个长期驻留、与 `Build` 对称切换的主代理。

### 2. 用户心智更自然

用户更容易理解为：

* “我现在让 Build 进入 planning mode”
  而不是：
* “我现在切到另一个平行主代理”

### 3. 更容易落地到 truth / protocol / UI

如果 `Plan` 是 mode，则：

* thread truth 只需保存 `threadMode`
* 不需要保存 `activePrimaryAgent`
* UI 可以清晰显示 `Agent: Build / Mode: plan`
* Worker/AgentRun 不需要承担“主代理切换”的产品语义

---

## Current-State Diagnosis

### Worker is currently a lifecycle shell

`Worker` 领域对象当前主要由：

* `workerId`
* `threadId`
* `taskId`
* `role`
* `spawnReason`
* `status`
* `startedAt`
* `endedAt`
* `resumeToken`
  构成，强调状态机，而不是产品语义。

### Worker manager is an instance manager, not an agent contract layer

`worker-manager` 当前只暴露：

* `spawn`
* `inspect`
* `resume`
* `cancel`
* `join`
  这说明它是 runtime lifecycle manager，而不是 agent semantics manager。

### Worker view is too shallow for product semantics

`WorkerView` 目前只暴露：

* `workerId`
* `threadId`
* `taskId`
* `role`
* `status`
* `spawnReason`
* `startedAt`
* `endedAt`
* `resumeToken` 

### Worker panel is a lifecycle panel, not an agent panel

TUI 当前 `worker-panel` 只显示：

* `worker`
* `role [status]`
* `spawnReason` 

### Protocol currently lacks mode semantics

* `ThreadView` 没有 `threadMode`。
* `RuntimeSnapshot` 没有 `threadMode`。
* `RuntimeSessionState` 没有 `primaryAgent / threadMode` 投影。

---

## Architecture Changes

## 1. Introduce ontology modules

### New modules

新增以下模块：

* `src/control/agents/thread-mode.ts`
* `src/control/agents/agent-spec.ts`
* `src/control/agents/subagent-spec.ts`
* `src/control/agents/system-agent-spec.ts`
* `src/control/agents/subagent-registry.ts`

### Responsibilities

#### `thread-mode.ts`

定义：

* `ThreadMode`
* 默认 mode
* mode 辅助函数

#### `agent-spec.ts`

定义 primary agent：

* `Build`

#### `subagent-spec.ts`

定义：

* `Explore`
* `Verify`
* `Review`
* `General`

#### `system-agent-spec.ts`

定义：

* `Compaction`
* `Summary`
* `Title`
* `MemoryMaintainer`

#### `subagent-registry.ts`

统一注册与查找 subagent spec。

---

## 2. Add `threadMode` to thread truth

### Required truth field

在 thread truth 中新增：

* `threadMode: "normal" | "plan"`

### Defaulting rules

* 新 thread 默认 `normal`
* 历史 thread migration 后默认补 `normal`

### Important constraint

v1 不在 truth 中保存：

* `activePrimaryAgent`

因为 v1 只有一个 primary agent：`Build`。

---

## 3. Update protocol

### `ThreadView`

在 `thread-view.ts` 中新增：

* `threadMode`

当前 `ThreadView` 还没有该字段。

### `RuntimeSnapshot`

在 `runtime-snapshot-schema.ts` 中新增：

* `threadMode`

当前 `RuntimeSnapshot` 还没有该字段。

### Events

新增 runtime event：

* `thread.mode_changed`

payload 至少包含：

* `threadId`
* `fromMode`
* `toMode`
* `trigger`
* `reason?`

---

## 4. Make `/plan` a mode toggle, not a text hack

### User-facing behavior

* 输入 `/plan` → 进入 plan mode
* 移除 `/plan` → 恢复 normal mode

### Internal behavior

系统内部必须有清晰动作：

* `set_thread_mode(plan)`
* `clear_thread_mode()` → `normal`

### Important implementation constraint

不要把“历史消息文本里有没有 `/plan`”当成唯一真相来源。
建议使用 thread-level mode marker 或等价机制。

---

## 5. Replace Worker with AgentRun

### Renaming goal

当前 `worker` 重构为：

* `AgentRun`

### Why rename

因为 `worker` 这个词在公开产品语义里并不自然，容易和产品层角色混淆。
`AgentRun` 更直接表达“这是某个 agent/subagent 的运行实例”。

### Proposed new fields

建议 `AgentRun` 至少包含：

* `agentRunId`
* `threadId`
* `taskId`
* `roleKind`

  * `primary`
  * `subagent`
  * `system`
* `roleId`

  * `build`
  * `verify`
  * `review`
  * `memory_maintainer`
  * 等
* `status`
* `spawnReason`
* `goalSummary`
* `inputSummary?`
* `outputSummary?`
* `visibilityPolicy`
* `resumeToken?`
* `startedAt?`
* `endedAt?`

### Transitional compatibility

当前 `WorkerRole` 先保留为 internal/runtime role，不立即强改为产品层名字。

映射可暂定为：

* `planner` → legacy/internal
* `executor` → `roleKind=primary`, `roleId=build`
* `verifier` → `roleKind=subagent`, `roleId=verify`
* `memory_maintainer` → `roleKind=system`, `roleId=memory_maintainer`

---

## 6. UI projection split

### Add Agent/Mode header

TUI 必须新增独立投影：

* `Agent: Build`
* `Mode: normal | plan`

### Keep runtime instance panel separate

当前 `worker-panel` 应降级/重命名为：

* `AgentRunPanel`
  或
* `Active Internal Jobs`

它的职责是展示 runtime lifecycle，不是产品层 agent 面板。

### Update RuntimeSessionState

`RuntimeSessionState` 增加：

* `primaryAgent: "build"`
* `threadMode: "normal" | "plan"`

当前它还没有这层投影。

---

## 7. Subagents remain contracts first

### Formal subagents

* `Explore`
* `Verify`
* `Review`
* `General`

### Instantiation policy

v1 不要求全部实例化成 `AgentRun`。
只有满足以下条件才应实例化：

1. 有独立生命周期
2. 有独立权限边界
3. 用户值得观察
4. 失败值得复盘
5. 独立成本归因有意义

### First candidate

`Verify` 是首个最适合条件性实体化的 subagent。

---

# 六、Implementation Work Packages

下面是完整开发工作包。不是按周，而是按依赖顺序。

## WP1 — Ontology core modules

实现：

* `thread-mode.ts`
* `agent-spec.ts`
* `subagent-spec.ts`
* `system-agent-spec.ts`
* `subagent-registry.ts`

完成标准：

* 代码中存在正式 ontology 类型与 registry
* 不再靠散落常量表达 agent/mode/subagent

---

## WP2 — Thread truth and persistence

实现：

* thread truth 中新增 `threadMode`
* migration 补历史默认值 `normal`
* 保存/恢复能力完整

完成标准：

* 新旧线程都能稳定读取 mode
* 重启不丢 mode

---

## WP3 — Protocol and events

实现：

* `ThreadView.threadMode`
* `RuntimeSnapshot.threadMode`
* `thread.mode_changed`
* `api-schema.ts` 类型链更新

完成标准：

* protocol 中存在 mode 语义
* replay/debug 能看到 mode 切换

---

## WP4 — Slash command to mode toggle

实现：

* `/plan` → `set_thread_mode(plan)`
* remove plan marker → `clear_thread_mode()`
* 不依赖消息文本作为唯一 truth

完成标准：

* `/plan` 和取消 `/plan` 都能稳定改变 thread mode

---

## WP5 — Build/Plan behavior split

实现：

* normal mode 行为
* plan mode 行为
* plan mode 规划后执行合同
* 关键细节缺失时的方案选择合同

完成标准：

* plan mode 先生成可执行计划，再继续 execute / verify / respond
* plan mode 不把功能开发请求误判成普通 respond-only 回复
* 如果需要用户决策，plan mode 给出 2-4 个具体方案选项，并由 TUI 方案选择卡片承接
* 方案选择必须是 durable run suspension（持久挂起），使用 `waiting_plan_decision` + `plan_decision` continuation 恢复原 run，不能只存在于 TUI 临时状态

---

## WP6 — AgentRun migration

实现：

* 引入 `AgentRun` 结构
* `worker` → `AgentRun` 迁移路径
* 旧 `WorkerRole` 映射策略
* 运行实例层命名与注释重构

完成标准：

* runtime instance 语义清楚
* 不再需要解释 “worker 到底是不是 agent”

---

## WP7 — TUI and projection split

实现：

* `RuntimeSessionState` 新投影
* `AgentModeHeader`
* `WorkerPanel` 语义降级或改名
* thread list 可显示 mode

完成标准：

* 用户能看到：

  * 当前 agent
  * 当前 mode
  * 当前 active instance
* 三者不再混淆

---

## WP8 — Documentation and tests

实现：

* 新文档 `agent-mode-ontology.md`
* 更新 `ARCHITECTURE.md`
* 更新 `CONTROL.md`
* 新增 schema / toggle / UI / migration / behavior tests

完成标准：

* 文档和代码术语一致
* 测试能证明 ontology 已经进入 truth/protocol/UI 三层

---

# 七、Compatibility Strategy

## 1. Short-term compatibility

短期可保留旧 `worker` 相关实现，但应明确：

* 这是 legacy/internal term
* 最终迁移方向是 `AgentRun`

## 2. Protocol compatibility

如果协议需要平滑过渡，可在短期内：

* 继续保留 `workers`
* 同时引入 `threadMode`
* 再逐步迁移到 `agentRuns` 命名

## 3. UI compatibility

短期可以先：

* 新增 `AgentModeHeader`
* 暂不立即改文件名 `worker-panel.tsx`
* 但 UI 标题和注释必须先改成 runtime/internal 含义

## 4. Data migration

历史数据 migration 需要保证：

* 缺失 `threadMode` 的 thread 自动补 `normal`
* 旧 worker 记录可映射为新 AgentRun 结构
* migration 失败时不能破坏现有 run-loop 恢复语义

---

# 八、Testing Plan

## 1. Schema tests

覆盖：

* `ThreadView.threadMode`
* `RuntimeSnapshot.threadMode`

## 2. Mode toggle tests

覆盖：

* 新线程默认 normal
* `/plan` → plan
* 清除 plan marker → normal
* 重启恢复后 mode 不丢

## 3. Behavior tests

覆盖：

* Build normal mode 正常执行
* Build plan mode 先规划再执行
* plan mode 对功能开发请求生成 implementation work，而不是 respond-only
* plan mode 缺少关键决策时输出 `decisionRequest`，TUI 渲染方案选择并通过 `resolve_plan_decision` 恢复原 run
* hydrate 能从 active `waiting_plan_decision` suspension 恢复方案选择卡片

## 4. Migration tests

覆盖：

* worker → AgentRun 兼容读取
* 历史 thread 默认补 mode
* 旧数据不会导致 snapshot/schema 崩溃

## 5. UI tests

覆盖：

* `AgentModeHeader` 正确显示
* `worker-panel` / `AgentRunPanel` 语义分层
* `RuntimeSessionState` 正确投影 `primaryAgent/build + threadMode`

---

# 九、Definition of Done

这次重构只有在下面这些条件全部成立时才算完成：

1. `Build` 被正式定义为唯一 primary agent
2. `Plan` 被正式定义为 thread mode
3. `threadMode` 已进入 thread truth
4. `threadMode` 已进入 `ThreadView` 和 `RuntimeSnapshot`
5. `/plan` 已落成正式 mode toggle，而不是文本 hack
6. 存在 `thread.mode_changed` 事件
7. `RuntimeSessionState` 有 `primaryAgent/build + threadMode` 投影
8. UI 中 `Agent/Mode` 与 `AgentRun lifecycle` 已分层显示
9. `worker` 已进入 `AgentRun` 迁移路径，或完成命名重构
10. `WorkerRole` 被明确降级为 internal/runtime role，而非产品层 ontology
11. `Explore / Verify / Review / General` 已有正式合同
12. 文档与测试已经同步完成

---

# 十、一句话结论

这次重构的本质不是“改几个名字”，而是：

**把 OpenPX 从当前模糊的 `worker-first` 语义，重构成清晰的 `Build / PlanMode / Subagent / AgentRun` 分层体系。**
