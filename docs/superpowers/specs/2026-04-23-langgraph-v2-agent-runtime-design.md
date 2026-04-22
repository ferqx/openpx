# LangGraph v2 Agent Runtime 设计

## 背景

OpenPX 当前尚未正式发版，因此 v2 可以直接全面升级，不需要保留 v1 兼容层。
本设计把 OpenPX 的 agent 底层能力整体交给 LangGraph 接管：
执行编排、持久性、持久执行、流媒体、打断、短期记忆、长期记忆和子 agent 都优先采用 LangGraph 原生模型。

OpenPX 在 v2 中不再维护自定义 run-loop、恢复状态机、memory store 或 subagent runtime。
OpenPX 的职责收窄为本地 Agent OS 壳层、工具环境、权限 UI、protocol（协议层）和 surface（交互表面）。

## 设计目标

- 用 Raw LangGraph `StateGraph` 作为 OpenPX v2 的 agent runtime（智能体运行时）。
- 让 LangGraph checkpoint 成为 agent 执行状态、暂停、恢复、短期记忆和 replay / time travel 的唯一真相源。
- 让 LangGraph SQLite store 成为长期记忆的唯一真相源。
- 让 approval、plan decision、clarification 等 human-in-the-loop（人在环路中）流程全部通过 LangGraph `interrupt()` 与 `Command({ resume })` 表达。
- 保持 surface 不直接访问 LangGraph，只通过 OpenPX protocol 消费 snapshot（快照）和 event stream（事件流）。
- 删除或降级当前所有 OpenPX 自定义 agent 底层语义。

## 非目标

- 不保留 v1 run-loop 兼容路径。
- 不迁移旧开发数据，不保证旧 `run_loop_states`、`run_suspensions`、`run_continuations` 或自定义 `memories` 数据恢复。
- 不在 LangGraph checkpoint 之外重新定义 OpenPX 自己的 agent 恢复语义。
- 不建立 OpenPX 自定义 memory 抽象作为 agent 记忆真相。
- 不让 TUI、Web、CLI 等 surface 直接调用 LangGraph API。

## 架构定位

v2 主轴为：

```text
src/app/main.ts
-> runtime daemon
-> harness session
-> LangGraph runtime
-> LangGraph root graph
-> protocol / surface
```

OpenPX 与 LangGraph 的边界如下：

- LangGraph 是 agent runtime，负责 agent 底层能力。
- OpenPX 是本地 Agent OS 壳层，负责启动、会话、工具环境、权限入口、协议投影和交互表面。
- LangGraph checkpoint 是 agent 执行恢复真相源。
- LangGraph SQLite store 是长期记忆真相源。
- OpenPX persistence（持久化层）只保存产品壳数据和审计数据，不定义 agent 执行真相。

后续必须更新 `CONTROL.md`、`ARCHITECTURE.md` 和 `ROADMAP.md`：
当前“run-loop 为执行内核、mixed recovery 为 v1 恢复语义”的叙事，在 v2 中改为
“LangGraph 是 agent runtime，checkpoint 是 agent 执行恢复真相；OpenPX 是本地 Agent OS 壳层、工具环境和 protocol / surface 层”。

## 组件边界与目录落位

### `src/harness/graph/`

`src/harness/graph/` 是 v2 唯一 agent 底层入口。

建议结构：

- `root-graph.ts`
  编译 OpenPX root `StateGraph`。
- `state.ts`
  定义 OpenPX graph state（图状态）。
- `runtime.ts`
  封装 graph invoke、stream、resume、cancel。
- `nodes/`
  放 root graph 节点，例如 `route`、`context`、`plan`、`delegate`、`execute`、`verify`、`review`、`respond`、`remember`。
- `subgraphs/`
  放 Explore、Verify、Review、General 等子图。
- `tools/`
  放 LangGraph tool wrappers（工具包装器）。
- `checkpoint/`
  初始化 LangGraph SQLite checkpointer。
- `store/`
  初始化 LangGraph SQLite store。
- `streaming/`
  把 LangGraph stream modes 映射到 OpenPX event stream。
- `interrupts/`
  定义 approval、plan decision、clarification、credential、external block 等 interrupt payload。

### `src/harness/core/`

`src/harness/core/` 只保留 session、projection、event bridge、command bridge。
它不再包含 run-loop 或 agent 底层调度。

### `src/control/`

`src/control/` 大幅收缩。
可保留作为 LangGraph node / tool 依赖的底层能力，例如本地工具执行器和风险策略。
凡是定义 OpenPX 自己 agent 生命周期、memory、subagent、recovery 的模块都应删除或迁移到 `src/harness/graph/` 的 LangGraph 原生实现中。

### `src/persistence/`

agent 底层真相以 LangGraph SQLite checkpoint / store 为主。
OpenPX SQLite 只存产品壳数据和审计数据，不再存 agent 执行真相。

### `src/surfaces/`

surface 继续只消费 OpenPX protocol。
TUI、Web、CLI 不直接调用 LangGraph API，也不直接读写 checkpoint 或 store。

## 删除或降级的旧概念

以下概念不再作为 OpenPX agent 底层能力保留：

- 自定义 `run-loop`
- 自定义 `RunLoopState`
- 自定义 `LoopStep`
- 自定义 `RunStateStore`
- 自定义 `RunSuspension`
- 自定义 `ContinuationEnvelope`
- 自定义 `human_recovery`
- 自定义 `restart_run` / `abandon_run`
- 自定义 `AgentRun` 生命周期系统
- 自定义 subagent registry / subagent runtime
- 自定义短期记忆 / 长期记忆抽象
- 自定义 graph 恢复合同
- 自定义 streaming buffer 语义
- 旧的 plan decision 机制
- legacy checkpoint invalidation migration

这些能力在 v2 中分别由 LangGraph graph state、checkpoint、interrupt、store、subgraph 和 streaming 接管。

## Graph State 与节点设计

Graph state 不复刻当前 `RunLoopState`，而使用 LangGraph 原生 agent state。

建议最小状态：

- `messages`
  对话消息历史，作为短期记忆主载体，由 LangGraph checkpoint 持久化。
- `workspace`
  当前 `workspaceRoot`、`projectId`、`cwd` 和环境信息。
- `intent`
  当前用户请求的结构化理解。
- `plan`
  当前执行计划，包含可选 steps。
- `workingContext`
  当前读取过的文件、证据、约束和项目规则摘要。
- `toolResults`
  工具调用结果摘要。
- `interrupt`
  当前 human-in-the-loop 请求投影，底层由 LangGraph `interrupt()` 产生。
- `response`
  最终输出草稿或最终回答。
- `metadata`
  model、cost、latency、node trace 等运行元信息。

Root graph 节点：

1. `route`
   判断用户输入类型：问答、代码修改、规划、检查、工具执行、记忆维护。
2. `context`
   收集项目规则、工作区状态、相关文件和 LangGraph long-term memory。
3. `plan`
   生成或更新执行计划。需要用户选择时直接 `interrupt()`。
4. `delegate`
   决定是否进入 subgraph，例如 Explore、Verify、Review、General。
5. `execute`
   通过 LangGraph tools 调用本地工具。需要权限时 `interrupt()`。
6. `verify`
   验证结果。可以是 graph node，也可以是 Verify subgraph。
7. `review`
   做结构化代码审查或风险检查。
8. `respond`
   汇总最终回答。
9. `remember`
   把长期稳定事实写入 LangGraph SQLite store。

Subgraph 建议：

- `Explore`
  只读搜索、文件读取、证据收集。
- `Verify`
  测试、类型检查、结果验证。
- `Review`
  代码审查、风险判断、变更说明。
- `General`
  小型辅助推理或非专门任务。

关键原则：

- graph state 是 agent state 的唯一来源。
- memory 直接用 LangGraph store。
- checkpoint 是短期状态和恢复状态的唯一来源。
- OpenPX snapshot 只是 graph state、stream、interrupt 的 projection。
- 工具权限不通过 OpenPX 自定义 suspension 表达，而是在 tool node 内触发 LangGraph interrupt。

## Protocol / UI 投影设计

v2 protocol 不暴露 OpenPX 自定义 run-loop 状态，而是暴露 LangGraph runtime 的投影视图。

Surface 只通过 OpenPX protocol 工作：

- `submit_input`
  提交用户输入，启动或继续当前 thread 的 graph invocation。
- `resume_interrupt`
  把用户对 interrupt 的选择或输入传回 runtime，内部调用 LangGraph `Command({ resume })`。
- `cancel_invocation`
  取消当前 graph invocation。
- `get_snapshot`
  获取当前 thread 的投影视图。
- `subscribe_events`
  订阅 LangGraph stream、graph lifecycle、tool lifecycle、interrupt 事件的适配结果。

Snapshot 建议包含：

- `thread`
  OpenPX 外层协作线信息：`threadId`、`workspaceRoot`、`projectId`、`title`、`updatedAt`。
- `graph`
  graph 运行投影：`status`、`activeNode`、`checkpointId`、`lastCheckpointAt`、`pendingInterrupt`。
- `messages`
  从 LangGraph state 投影出的对话消息。
- `plan`
  从 graph state 投影出的当前计划。
- `tools`
  当前工具调用状态和最近结果。
- `subagents`
  从 subgraph / node lifecycle 投影出的 Explore、Verify、Review、General 状态。
- `memory`
  从 LangGraph store 投影出的可展示记忆摘要。
- `answer`
  最终回答或当前草稿。
- `events`
  最近事件摘要，来自 LangGraph stream adapter。

Event stream 映射：

- LangGraph `updates` -> `graph.node_updated`
- LangGraph `messages` -> `stream.text_chunk` 或 `message.delta`
- LangGraph `custom` -> `agent.custom_event`
- LangGraph `tools` -> `tool.started` / `tool.completed` / `tool.failed`
- LangGraph `debug` -> 仅调试模式展示
- interrupt -> `graph.interrupted`
- resume -> `graph.resumed`
- checkpoint saved -> `graph.checkpoint_saved`

UI 调整：

- TUI 顶部可以继续显示 `Agent: Build`，但底层不再是 OpenPX 自定义 AgentRun。
- AgentRun 面板应改成 graph / subgraph activity 面板。
- Approval 面板应改成 interrupt 面板；approval 是 interrupt payload 的一种类型。
- Plan decision 卡片也应改成 interrupt payload 的一种类型。
- Memory 面板只展示 LangGraph store 的投影。
- 不再展示 `waiting_approval`、`human_recovery`、`continuation`、`run-loop step` 等 v1 概念。

Protocol 是投影层，不是第二套 agent runtime。
它只负责把 LangGraph 的 state、stream、interrupt、checkpoint 投影成稳定 UI 数据，不新增恢复或记忆语义。

## 数据与 SQLite 设计

v2 数据层分成 LangGraph agent runtime 数据和 OpenPX 产品壳数据。

LangGraph agent runtime 数据是 agent 底层真相：

- checkpoint
  保存 graph state、checkpoint history、恢复点、短期记忆。
- store
  保存长期记忆，使用 namespace / key / value 模型。
- `thread_id`
  直接使用 OpenPX `threadId`，保证一个 OpenPX thread 对应一个 LangGraph thread。
- checkpoint namespace
  用于区分 root graph、subgraph、特殊任务上下文。
- checkpoint id
  可投影到 snapshot，但 OpenPX 不解释其恢复语义。

OpenPX 产品壳数据只保留必要外层记录：

- `threads`
  `workspaceRoot`、`projectId`、`title`、`status`、`updatedAt`。
- `runs`
  一次用户提交或一次 graph invocation 的外层记录。它不定义恢复语义。
- `events`
  UI 和审计用事件。
- `approvals`
  可选保留为权限审计表，但实际暂停/恢复由 LangGraph interrupt 定义。
- `execution_ledger`
  可选保留为工具副作用审计表，不定义恢复边界。
- `settings/config`
  OpenPX 本地配置。

SQLite 接入原则：

- LangGraph checkpoint 直接写入 SQLite。
- LangGraph long-term memory store 直接写入 SQLite。
- 优先使用 LangGraph 官方 SQLite checkpointer。
- 优先使用 LangGraph 官方 SQLite store 或官方推荐的 store 接口实现。
- checkpoint / store 与 OpenPX 产品壳表可以在同一个 SQLite 文件中，便于备份、迁移、调试。
- 如果官方 checkpointer / store 需要独立连接或独立表结构，OpenPX 不包一层重定义语义，只做连接配置和路径管理。
- OpenPX 可以建立只读投影查询，但不得直接修改 LangGraph checkpoint / store 内部表。

Memory 规则：

- 短期记忆来自 LangGraph checkpoint 中的 `messages` 和 graph state。
- 长期记忆来自 LangGraph SQLite store。
- 写长期记忆只能发生在 graph node / tool 中，例如 `remember` node。
- UI 展示记忆时，只读取 LangGraph store 投影。
- 不再维护 OpenPX 自定义 `MemoryRecord`、`MemoryStorePort`、`SqliteMemoryStore` 作为 agent 记忆。

迁移策略：

- 当前未正式发版，不做兼容迁移。
- 允许删除旧 run-loop、memory、checkpoint invalidation 相关 schema 和代码。
- 对现有本地开发数据，可提供一次性 reset 或 rebuild，不保证旧数据恢复。

## 权限、工具与 Interrupt 设计

v2 中，OpenPX 不再用 `approval suspension / continuation` 表达权限暂停，而是把权限请求建模为 LangGraph interrupt payload。

工具执行路径：

1. Graph node 决定调用本地工具，例如 read file、apply patch、shell command、test runner。
2. Tool wrapper 先做本地风险判断。
3. 如果无需人工确认，工具直接执行并把结果写回 graph state。
4. 如果需要人工确认，tool wrapper 调用 LangGraph `interrupt()`，payload 描述请求。
5. Surface 收到 `graph.interrupted` 事件，展示 approval / confirm UI。
6. 用户批准或拒绝后，surface 发送 `resume_interrupt`。
7. Runtime 用 LangGraph `Command({ resume })` 恢复同一 graph thread。
8. Tool wrapper 根据 resume value 继续执行或返回拒绝结果。

Interrupt payload 建议统一成 discriminated union（带类型标签的联合类型）：

- `approval`
  用于高风险工具动作，例如删除文件、写文件、运行带副作用命令。
- `plan_decision`
  用于需要用户选择方案。
- `clarification`
  用于缺少必要上下文，需要用户补充。
- `credential`
  用于需要用户提供或确认凭据。
- `external_block`
  用于外部系统不可用、需要用户处理。

Approval payload 最少包含：

- `kind: "approval"`
- `requestId`
- `toolName`
- `summary`
- `risk`
- `argsPreview`
- `cwd`
- `affectedPaths`
- `recommendedDecision`
- `resumeSchema`

Resume value 最少包含：

- `requestId`
- `decision: "approved" | "rejected"`
- `reason?`
- `editedArgs?`

权限边界：

- 风险策略可以继续由 OpenPX 提供，因为这是本地 Agent OS 壳层职责。
- 暂停/恢复不能由 OpenPX 自定义状态机接管，只能通过 LangGraph interrupt / resume。
- 审批记录可以写入 OpenPX `approvals` 审计表，但表只是审计，不是恢复真相。
- 工具副作用可以写入 `execution_ledger` 审计表，但 checkpoint 仍是 agent 执行恢复真相。

工具实现建议：

- `src/harness/graph/tools/`
  放 LangGraph tool wrappers。
- `src/control/tools/`
  可保留底层执行器和风险策略，但不再拥有 agent 调度语义。
- 所有可产生副作用的 tool wrapper 必须在执行前完成风险判断和 interrupt。
- 工具结果必须回写 graph state，并通过 stream event 投影给 UI。
- 如果工具执行失败，失败作为 tool result 返回 graph，而不是另开 OpenPX 恢复状态。

权限是 OpenPX 产品壳职责，暂停/恢复是 LangGraph runtime 职责。
OpenPX 可以决定“是否需要用户确认”，但不能在 LangGraph 之外定义另一套恢复流程。

## 测试与评测设计

测试目标从“验证 OpenPX 自定义 run-loop 恢复合同”改为“验证 OpenPX 是否正确承载 LangGraph runtime”。

核心测试矩阵：

- Graph invocation
  用户输入能启动 root graph，并产出最终 response。
- Checkpoint persistence
  graph state 能写入 SQLite checkpoint，重启后能按 LangGraph 语义继续。
- Interrupt / resume
  approval、plan decision、clarification 都通过 LangGraph `interrupt()` 暂停，并通过 `Command({ resume })` 恢复。
- Tool permission
  高风险工具在执行前触发 interrupt；批准后执行，拒绝后不执行。
- Streaming
  LangGraph stream modes 能映射成 OpenPX event stream，TUI 能稳定渲染。
- Memory
  短期记忆来自 checkpoint；长期记忆写入并读取 LangGraph SQLite store。
- Subgraph / subagent
  Explore、Verify、Review、General 能作为 subgraph 或 node 被 root graph 调用，并能投影活动状态。
- Protocol projection
  surface 只消费 snapshot / event，不直接访问 LangGraph。
- Schema cleanup
  旧 `run_loop_states`、`run_suspensions`、`run_continuations`、`memories` 不再参与 agent runtime。
- Eval loop
  harness eval 从 run-loop trajectory 改为 graph trajectory、checkpoint、stream、interrupt 验证。

## 文档更新范围

- `CONTROL.md`
  改写控制定义：v2 中 LangGraph 是 agent runtime，checkpoint 是 agent 执行恢复真相；OpenPX 是本地 Agent OS 壳层、工具环境和 protocol / surface 层。
- `ARCHITECTURE.md`
  改写系统主轴和模块边界，删除 run-loop 作为执行内核的叙事。
- `ROADMAP.md`
  改写当前阶段：从 run-loop hardening 转为 LangGraph runtime integration / agent capability。
- `docs/space/understanding/*`
  更新 harness spine、state flows、agent ontology、protocol、code map。
- `docs/space/execution/*`
  更新 coding workflow、validation workflow、refactor playbook。
- API schema
  更新 snapshot / event / command schema，以 graph-native 投影替代 run-loop 投影。

## 变更影响记录

- 受影响主要子系统：
  harness core、graph runtime、protocol、surface、persistence、tools、eval。
- 受影响入口点：
  `src/app/main.ts`、runtime daemon、session registry、bootstrap / context assembly。
- 证明测试：
  checkpoint、interrupt / resume、streaming、memory、subgraph、tool approval。
- 词汇影响：
  run-loop、suspension、continuation、AgentRun、memory store 等旧术语删除或降级。
- `CONTROL.md` 是否必须变更：
  是。
