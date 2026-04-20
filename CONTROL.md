# OpenPX 控制构件

本文档是仓库恢复的权威控制构件。

## 真相层级

当信息来源不一致时，按以下顺序判断：

1. 运行行为
2. 测试
3. 代码
4. 本文件中明确列入白名单的文档
5. 其他一切

默认情况下，所有文档均无权威性，除非出现在下面的白名单中。

## Harness-first 控制定义

OpenPX 采用 harness-first（以 harness 为先）控制模型。

在该模型中：

- harness 是系统本体；
- thread、run、approval、recovery、event history（事件历史）、execution ledger（执行账本）构成运行真相；
- snapshot、session view、TUI state 只是真相的投影；
- TUI 是默认 surface，不是系统真相源；
- 新增任何 surface 都必须通过稳定 protocol / app server 访问 harness；
- `src/harness/eval/real`、review、promotion 是 harness 的反馈闭环，而不是外围测试装饰。

若文档叙事、目录命名或局部实现与上述原则冲突，以 harness-first 原则为准。

## Run-loop 恢复合同

当前 run-loop v1 的恢复合同固定如下：

- `waiting_approval` 是唯一允许自动恢复的边界。
- 审批恢复只承诺到“恢复事务完成、下一步尚未产生新副作用”的边界。
- `plan / execute / verify / respond` 不承诺任意边界的自动精确续跑。
- execution ledger 一旦表明副作用结果不确定，必须显式落 `human_recovery`。
- `human_recovery` 不可自动退出；只能由显式恢复动作解除。
- 显式恢复动作当前固定为：
  - `restart_run`
  - `resubmit_intent`
  - `abandon_run`
- `cancel` 必须失效当前 run 关联的 active suspension、created continuation 与 pending approval，不得让旧审批继续复活已中断 run。
- 旧 continuation 不得在恢复动作之后继续消费。
- run-loop 审计记录默认保留 7 天；completed run 只删除 active state，不立即物理删除 suspension / continuation 审计记录。

## 最终回答真相约束

面向用户的最终回答（final response）必须与中间运行摘要分离。

- durable answer 只承载真正面向用户的最终回答
- `executionSummary`、`verificationSummary`、`pauseSummary` 属于运行阶段数据或 surface 投影视图，不是 durable answer
- `interrupt`、`waiting_approval`、`human_recovery` 产生的是暂停说明，不得写入 durable answer
- surface 可以分别展示 final response、pause、verification、execution，但不得把 pause / verification / execution 固化成 durable answer

## 真相层级（harness 语境）

1. durable thread / run / approval / event / ledger
2. harness core rules and invariants
3. protocol schemas and app server contracts
4. surface projections（TUI / CLI / Web / IDE）
5. generated summaries and derived reports

## 文档白名单

只有以下仓库文档可以默认指导实现或规划：

- `CONTROL.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `README.md`
- `docs/space/index.md`
- `docs/space/understanding/index.md`
- `docs/space/understanding/harness-spine.md`
- `docs/space/understanding/harness-invariants.md`
- `docs/space/understanding/harness-protocol.md`
- `docs/space/understanding/runtime-spine.md`
- `docs/space/understanding/agent-mode-ontology.md`
- `docs/space/understanding/core-concepts.md`
- `docs/space/understanding/config-system.md`
- `docs/space/understanding/state-flows.md`
- `docs/space/understanding/harness-code-map.md`
- `docs/space/understanding/harness-protocol-code-map.md`
- `docs/space/understanding/harness-feedback-loop.md`
- `docs/space/understanding/harness-surface-boundary.md`
- `docs/space/execution/index.md`
- `docs/space/execution/coding-workflow.md`
- `docs/space/execution/validation-workflow.md`
- `docs/space/execution/refactor-playbook.md`
- `docs/space/execution/tech-debt-tracker.md`
- `docs/space/execution/active/index.md`
- `docs/space/execution/completed/index.md`
- `docs/space/references/index.md`
- `docs/space/generated/index.md`

OpenPX 当前采用“根级控制文档 + `docs/space/` 官方知识空间”的模型。
除非本文档明确更改，否则不要把 `docs/space/` 以外的 `docs/` 内容视为权威。

## 默认阅读顺序

默认进入顺序如下：

1. `AGENTS.md`
2. `CONTROL.md`
3. `ARCHITECTURE.md`

只有在以上三份仍不足以回答问题时，才进入：

4. `docs/space/index.md`
5. `docs/space/understanding/index.md` 或 `docs/space/execution/index.md`

禁止默认全量扫描 `docs/space/`。

如果目标是执行改动、验证结果或继续结构减法，优先进入：

- `docs/space/execution/coding-workflow.md`
- `docs/space/execution/validation-workflow.md`
- `docs/space/execution/refactor-playbook.md`
- `docs/space/execution/tech-debt-tracker.md`

## 运行时主轴

以下是从代码和测试推导出的当前主要产品路径：

1. `package.json`
   主要脚本：`bun run dev`
2. `src/app/main.ts`
   产品入口，负责选择并附加默认 surface
3. `src/runtime/service/runtime-daemon.ts`
   确保或启动共享运行时进程，并接入 app server 组合层
4. `src/harness/server/app-server.ts`
   组合 HarnessSessionRegistry 与 HTTP server，作为默认启动组合根
5. `src/harness/server/harness-session-registry.ts`
   负责 scope 级 harness session 与执行基座
6. harness core / protocol / app server
   负责 thread、approval、恢复、投影视图与对外稳定协议
7. surfaces
   当前默认是 TUI，后续可扩展到 CLI、Web、IDE 等表面

最小端到端循环：

- 用户启动 `bun run dev`
- `src/app/main.ts` 确保运行时守护进程
- 默认 surface 附加到共享 harness
- 用户输入通过稳定协议进入 harness 拥有的状态和命令

## AgentRun 边界

`AgentRun` 是 runtime instance（运行实例）的正式语义落点。

当前边界规则如下：

- `src/domain/agent-run.ts` 是唯一运行实例领域入口，内聚 `AgentRunRecord / AgentRunStatus / AgentRunRuntimeRole`。
- `planner / executor / verifier / memory_maintainer` 仍保留为底层 runtime role 字面量，但它们挂在 `AgentRunRecord.role` 上，不再挂在独立 `Worker` 实体上。
- `src/control/agents/agent-run-adapter.ts` 负责把底层 runtime role 投影为正式 `AgentRun` 协作语义。
- `RuntimeSnapshot` 与 `thread.view_updated` 正式暴露 `agentRuns`，不再并行保留 `workers`。
- runtime protocol 的生命周期命令与事件已使用 `agent_run_*` / `agent_run.*`。
- `agent_runs` / `agent_run_id` / `agentRunStore` / `agentRunManager` 是当前唯一正式内部实现命名。
- `worker` 只允许出现在历史设计说明或旧角色字面量解释中，不再构成当前实现主命名。

当前固定映射为：

- `executor` -> `roleKind=primary`, `roleId=build`
- `verifier` -> `roleKind=subagent`, `roleId=verify`
- `memory_maintainer` -> `roleKind=system`, `roleId=memory_maintainer`
- `planner` -> `roleKind=legacy_internal`, `roleId=planner`

## Plan mode 决策挂起合同

`plan` 不是独立 agent，而是 `Build` 在当前 thread 上的 mode。

`plan` mode 可以形成 thread-level plan decision suspension（线程级方案选择挂起）：

- planner 在关键信息不足时可以产出 `planDecision`。
- run-loop 将其保存为 `waiting_plan_decision` suspension。
- surface 显示方案选择卡片。
- 用户选择方案后，surface 发送 `resolve_plan_decision`。
- control plane 构造 `plan_decision` continuation，并恢复同一个 run 回到 planner。

`plan decision` 与 `approval` 是两种不同挂起语义：

- `approval` 是风险控制与操作许可，回答“是否允许执行这个动作”。
- `plan decision` 是方案选择与路径决定，回答“接下来按哪个方案继续”。

两者都可能暂停 run，但 `waiting_plan_decision` 不属于自动恢复边界；
自动恢复仍只允许发生在 `waiting_approval`。

## 代码阅读顺序

如果要重新理解当前主路径，按这个顺序读：

1. `src/app/main.ts`
   产品入口，负责启动或连接 runtime，然后挂载 TUI
2. `src/runtime/service/runtime-daemon.ts`
   决定复用还是新建 runtime daemon，并挂接 app server
3. `src/harness/server/app-server.ts`
   组合 registry 与 HTTP server，定义默认 surface 的接入根
4. `src/harness/server/harness-session-registry.ts`
   为不同 scope 组装并缓存 runtime session
5. `src/harness/core/session/harness-session.ts`
   维护 active thread、组装 snapshot、转发实时事件
6. `src/app/bootstrap.ts`
   装配 stores、model gateway、control plane、kernel
7. `src/harness/core/session/session-kernel.ts`
   把 submit/approve/reject 这些命令投影成统一 session 视图

如果只是想看次级工具链，不要从它们开始：

- `src/eval/run-suite.ts`
- `src/harness/eval/real/run-suite.ts`
- `src/validation/run-suite.ts`

这三个文件只是 CLI 壳层，不是产品主架构入口。

## 核心概念映射

如果你想先理解数据模型，再理解调用链，按这四个概念看：

## 术语表

为了降低技术术语理解门槛，后续注释和说明默认按下面这套中英对照执行：

- `runtime`
  运行时。指真正持有状态、执行命令、发布事件的执行基座。
- `daemon`
  守护进程。指后台常驻、可被复用的 runtime 服务进程。
- `scope`
  作用域。这里特指一个 `workspaceRoot + projectId` 组合。
- `snapshot`
  快照。指某个时刻 runtime 对外暴露的完整状态视图。
- `kernel`
  内核边界。这里不是操作系统内核，而是 surface 与 harness core 之间的稳定命令边界。
- `control plane`
  控制面。负责审批、工具策略、任务生命周期、run 推进等协调逻辑。
- `protocol`
  协议层。指 runtime 与 TUI / client 之间传递命令、事件、视图的接口层。
- `projection` / `projected view`
  投影视图。指把底层 durable 状态整理成 UI 可直接消费的视图结果。
- `hydrate`
  水合 / 回填。指从持久化状态恢复出当前 session 视图，而不是重新生成一份业务状态。
- `resume`
  恢复继续执行。指从 blocked / interrupted / waiting_approval 状态重新推进 run。
- `interrupt`
  中断。指人为停止当前 run 的继续推进。
- `worker`
  内部工作单元。当前是底层 runtime 实现实词；在新的产品语义里，它更接近 `AgentRun`（运行实例），不是 primary agent（主代理）本体。
- `primary agent`
  主代理。当前正式值只有 `Build`，表示线程默认由哪个产品层代理承担主要工作。
- `thread mode`
  线程模式。当前正式值只有 `normal | plan`，表示 `Build` 在当前 thread 上采用哪种工作方式。
- `AgentRun`
  运行实例。表示一次内部执行单元的生命周期对象，负责状态、恢复和完成，不等于产品层 agent 身份。

### Thread

- 定义文件：`src/domain/thread.ts`
- 真实职责：表示一条长期协作线，而不是某一步执行
- 关键归属：
  - `workspaceRoot`
  - `projectId`
  - narrative / recovery 相关持久状态
- 主要使用位置：
  - `src/harness/core/session/harness-session.ts`
  - `src/harness/core/session/session-kernel.ts`
  - `src/app/bootstrap.ts`

### Run

- 定义文件：`src/domain/run.ts`
- 真实职责：表示 thread 内一次执行尝试
- 关键归属：
  - `status`
  - `trigger`
  - `activeTaskId`
  - `blockingReason`
- 主要使用位置：
  - `src/app/bootstrap.ts`
  - `src/harness/core/session/session-kernel.ts`
  - `src/harness/core/session/harness-session.ts`

### Task

- 定义文件：`src/domain/task.ts`
- 真实职责：表示 run 内当前具体步骤
- 关键归属：
  - `summary`
  - `status`
  - `blockingReason`
- 主要使用位置：
  - `src/control/tasks/task-manager.ts`
  - `src/app/bootstrap.ts`
  - `src/harness/core/session/session-kernel.ts`
  - `src/harness/core/session/harness-session.ts`

### Approval

- 定义文件：`src/domain/approval.ts`
- 真实职责：表示一次必须人工确认的高风险工具动作
- 关键归属：
  - `toolCallId`
  - `toolRequest`
  - `risk`
  - `status`
- 主要使用位置：
  - `src/control/policy/approval-service.ts`
  - `src/app/bootstrap.ts`
  - `src/harness/core/session/session-kernel.ts`
  - `src/harness/core/session/harness-session.ts`

## 命令流映射

当前主路径里，一条用户输入大致这样流转：

1. `src/app/main.ts`
   启动或连接 runtime，并把 TUI 接到 runtime client
2. `src/runtime/service/runtime-daemon.ts`
   复用或新建共享 runtime，并挂接 app server
3. `src/harness/server/app-server.ts`
   作为 surface 进入 harness protocol 的组合根
4. `src/harness/server/harness-session-registry.ts`
   为当前 scope 获取 runtime session
5. `src/harness/core/session/harness-session.ts`
   把协议命令交给 runtime command handler，并负责 snapshot / event 读取
6. `src/harness/core/session/session-kernel.ts`
   解析当前 thread/run/task/approval 上下文，启动后台 control-plane 工作
7. `src/app/bootstrap.ts`
   control plane 继续推进 run-loop、tool、approval、run/task 状态

因此概念关系应理解成：

- `thread` 回答：我们在处理哪条长期工作线
- `run` 回答：这次执行尝试现在处于什么状态
- `task` 回答：当前这一步具体在做什么
- `approval` 回答：哪一个高风险 tool call 正在等待人工确认

## 状态流检查点

当前主路径最重要的状态流转检查点如下：

### 用户提交输入

- 入口：`src/harness/core/session/runtime-command-handler.ts`
- 转换：`add_task` / `plan_task` 最终都转成 `submit_input`
- 会话边界：`src/harness/core/session/session-kernel.ts`
- 真正推进：`src/app/bootstrap.ts` 中的 `controlPlane.startRootTask(...)`

### 新建执行

- `startRootTask(...)` 会：
  - 创建 `Run`
  - 把 `Run` 置为 `running`
  - 创建根 `Task`
  - 把 `Task` 置为 `running`
  - 调用 run-loop engine 推进执行步骤

### 等待审批

- 如果 run-loop 执行期间产生 pending approval 或 suspension：
  - `Task` 会变成 `blocked`
  - `Run` 会变成 `waiting_approval`
- 这时 UI 看到的是：
  - thread 有 pending approval
  - task 被阻塞
  - approval 面板出现待确认动作

### 批准后恢复

- 入口：`approve_request`
- 如果存在 suspension，系统会继续走 continuation resume
- 如果没有 suspension，系统直接执行已经批准的 tool request
- 两条路径的共同目标都是：
  - 让当前 `Run` 继续推进
  - 最终更新 `Task` / `Run` 的完成状态

### 拒绝后恢复

- 入口：`reject_request`
- 如果存在 suspension：
  - 系统构造“拒绝该动作后的原因”
  - 然后通过 continuation 从 planner 步骤触发 replan
- 所以 reject 不是简单停止，而是“带着拒绝原因重新规划”

## 结构减法进展

当前结构减法已开始，并且坚持“小步迁移，不改行为”的原则。

### 第一刀：`bootstrap.ts` 支持逻辑抽离

- 已新增：`src/app/control-plane-support.ts`
- 当前已迁出的内容：
  - task 状态落盘辅助
  - approval tool request 还原
  - resume 输入归一化
  - responder prompt 组装
  - 若干不属于 control-plane 主流程的支持函数

这一步的意义是：

- 让 `src/app/bootstrap.ts` 更接近“装配根 + control-plane 主流程”
- 减少“主流程代码”和“支持性小工具函数”混在一起的程度
- 在不改变运行行为的前提下，为后续继续拆分创造边界

### 第二刀：`bootstrap.ts` 中的 approval 处理抽离

- 已新增：`src/app/control-plane-approval-resolution.ts`
- 当前已迁出的内容：
  - `approveRequest` 的批准恢复主流程
  - `rejectRequest` 的拒绝恢复与 replan 主流程
  - approval fallback task 的构造逻辑

这一步的意义是：

- 让 `bootstrap.ts` 不再同时背着“approval 处理细节”和“control-plane 总装逻辑”
- 把 approval resolution 变成可单独阅读、单独继续拆分的一层
- 为后续继续切出 run/task lifecycle 留出更清晰的边界

### 第三刀：`bootstrap.ts` 中的 run/task lifecycle 抽离

- 已新增：`src/app/control-plane-run-lifecycle.ts`
- 当前已迁出的内容：
  - root task 启动前的 run/task 准备逻辑
  - engine 返回后的 run/task 收口逻辑
  - `waiting_approval / completed` 的统一判定和状态更新

这一步的意义是：

- 让 `bootstrap.ts` 不再直接承载整段 run/task 生命周期细节
- 把“control-plane 主流程”和“生命周期推进规则”分成两层
- 为后续继续拆出 run-loop 边界和 app context assembly 创造边界

### 第五刀：`createAppContext` 装配根收口

- 已新增：`src/app/app-context-assembly.ts`
- 当前已迁出的内容：
  - 持久化层初始化（sqlite、stores、run-state、异常执行恢复）
  - model gateway 解析
  - 服务层装配（narrative、scratch policy、memory consolidator、control plane、agent run manager、kernel）
  - model gateway 到 kernel 的事件桥接
  - 资源关闭顺序

这一步的意义是：

- 让 `createAppContext` 读起来变成固定的五步装配顺序，而不是一段长初始化脚本
- 把“装配根职责”和“control-plane 业务推进职责”分开，避免 `bootstrap.ts` 再次回涨成全能文件
- 为下一步处理 `src/surfaces/tui/app.tsx` 之前，先把主产品入口的装配逻辑稳定下来

### 第六步第一刀：`app.tsx` 中的状态支持逻辑抽离

- 已新增：`src/surfaces/tui/app-state-support.ts`
- 当前已迁出的内容：
  - 对话显示状态模型
  - approval 输入判定
  - utility pane session 快照构造
  - utility pane 快照相等性比较

这一步的意义是：

- 先把 `app.tsx` 里最纯的支持逻辑抽出去，降低顶层 TUI 协调器的阅读噪声
- 消除 `app.tsx` 和 `app-screen-view.ts` 之间重复维护的一份对话状态定义
- 在不触碰事件流和交互行为的前提下，为后续继续拆“会话同步”和“输入处理”留出更清晰的边界

### 第六步第二刀：`app.tsx` 中的会话同步层抽离

- 已新增：`src/surfaces/tui/app-session-support.ts`
- 当前已迁出的内容：
  - session result 到 TUI session state 的同步逻辑
  - kernel event 到 TUI 状态更新的分发逻辑
  - `thread.view_updated / session.updated / stream.*` 等事件对应的会话同步规则

这一步的意义是：

- 把 `app.tsx` 中最重的一段“状态同步 + 事件分发”从顶层组件里移出
- 让顶层 TUI 文件更接近“组合状态、连接回调、渲染 Screen”的协调器角色
- 为后续继续拆输入处理和 launch/utility pane 状态时，保留清晰的同步边界

### 第六步第三刀：`app.tsx` 中的输入分发层抽离

- 已新增：`src/surfaces/tui/app-input-support.ts`
- 当前已迁出的内容：
  - composer mode 判定
  - shell stage 推导
  - approval 输入提交路径
  - 本地 slash command 分发
  - 普通 submit / plan 提交路径
  - launch thread 保障逻辑

这一步的意义是：

- 把 `app.tsx` 里“如何解释输入、如何分发命令、如何驱动 launch/utility pane 状态”的逻辑从顶层组件中移出
- 让顶层 TUI 组件进一步收窄成状态连接与视图组合层
- 为第七步总收口前，先把 `app.tsx` 的主要复杂度热点拆成状态支持、会话同步、输入分发三层

## 当前收口状态

到当前阶段，仓库已经从“入口、文档、状态边界都混杂”收回到下面这个程度：

- 根级文档已经收口，默认只看 `CONTROL.md`、`AGENTS.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`README.md`
- 产品主路径已经稳定为：
  `main.ts -> runtime-daemon -> app-server -> harness-session-registry -> harness protocol -> default TUI surface`
- `bootstrap.ts` 已经完成五刀，主要复杂度被拆成：
  - `control-plane-support`
  - `control-plane-approval-resolution`
  - `control-plane-run-lifecycle`
  - `app-context-assembly`
- `app.tsx` 已经完成三刀，主要复杂度被拆成：
  - `app-state-support`
  - `app-session-support`
  - `app-input-support`
- 当前可以把产品主线理解成：
  runtime 持有真相
  kernel 暴露稳定命令边界
  TUI 负责消费 session/view 并组织本地交互

这不代表仓库已经“简单”，但代表它已经重新具备可解释的主轴和可持续的小步重构边界。

## TUI 视图映射

如果你是从界面反推代码，按这个映射看：

### App 总装层

- `src/surfaces/tui/app.tsx`
  TUI 顶层状态协调器，负责把 kernel 返回的 session 状态整理成 screen 所需的数据
- `src/surfaces/tui/app-screen-view.ts`
  视图组装层，把 session 数据拆成 conversation / utility / chrome / composer 四块
- `src/surfaces/tui/screen.tsx`
  屏幕布局层，决定线程面板、主交互流、工具面板、输入框、状态栏如何摆放

### 线程面板

- 组件文件：`src/surfaces/tui/components/thread-panel.tsx`
- 直接数据来源：`ThreadSummary`
- 实际上对应：`ThreadView[]`
- 你在界面上看到的内容主要来自：
  - `threadId`
  - `activeRunStatus`
  - `pendingApprovalCount`
  - `blockingReasonKind`
  - `narrativeSummary`

### 任务显示

- 组件文件：`src/surfaces/tui/components/task-panel.tsx`
- 直接数据来源：`TaskSummary`
- 实际上对应：`TaskView[]`
- 你在界面上看到的内容主要来自：
  - `taskId`
  - `summary`
  - `status`
  - `blockingReason`

### 审批显示

- 组件文件：`src/surfaces/tui/components/approval-panel.tsx`
- 直接数据来源：`ApprovalSummary`
- 实际上对应：`ApprovalView[]`
- 你在界面上看到的内容主要来自：
  - `approvalRequestId`
  - `summary`
  - `status`
  - `risk`

### 主交互流

- 组件文件：`src/surfaces/tui/components/interaction-stream.tsx`
- 上游组装文件：`src/surfaces/tui/app-screen-view.ts`
- 混合展示内容：
  - 用户/助手消息
  - 任务状态
  - 审批状态
  - agent run 状态
  - narrativeSummary

这意味着主交互流不是单一实体视图，而是把多种 view 混排后的结果。

### 状态栏

- 组件文件：`src/surfaces/tui/components/status-bar.tsx`
- 主要来源：
  - 当前 model 信息
  - thinking level
  - `SessionStage`
  - 当前 workspaceRoot

状态栏显示的是"当前会话阶段"，不是 thread/run/task 的完整持久化状态。

## 存储到视图映射

这四个核心概念在系统里有三种存在形态：

1. domain 实体
   定义业务对象本身，例如 `Thread`、`Run`、`Task`、`ApprovalRequest`
2. store 持久化记录
   存进 sqlite，例如：
   - `sqlite-thread-store.ts`
   - `sqlite-run-store.ts`
   - `sqlite-task-store.ts`
   - `sqlite-approval-store.ts`
3. protocol / TUI 视图
   给 runtime client 和 TUI 使用，例如：
   - `thread-view.ts`
   - `run-view.ts`
   - `task-view.ts`
   - `approval-view.ts`

理解时要始终区分：

- domain 实体：系统内部"真实对象"
- store 记录：对象如何被持久化
- view：对象如何被展示给界面

## 支持的脚本

### 主要

- `bun run dev`
- `bun test`
- `bun run typecheck`

### 次要

- `bun run smoke:planner`
- `bun run eval:core`
- `bun run eval:suite`
- `bun run eval:review`
- `bun run eval:real`
- `bun run validation:run`

目前 `src/app/main.ts` 之外没有其他支持的根级入口点。

## 子系统分类

### 主要

- `src/app`
  引导逻辑和入口点所有权
- `src/harness`
  harness core、protocol、app server 与评测闭环主语
- `src/runtime`
  运行时守护进程、run-loop 推进与共享运行支持
- `src/surfaces`
  TUI 渲染和面向运行时的 client/kernel 适配器
- `src/persistence`
  持久化 stores、run-state 和 SQLite 实现
- `src/control`
  策略、任务、工具和 agent run 协调
- `src/domain`
  核心实体和生命周期规则
- `src/shared`
  配置和小型共享原语

### 次要

- `src/eval`
  确定性内部评估工具
- `src/harness/eval/real`
  实时或追踪支持的评估工具
- `src/validation`
  面向评估后端的正式验证封装
- `src/infra`
  模型网关和提供者支持工具

### 冻结 / 噪音候选

- 非运行时主轴的占位符或重复入口面
- 与稳定术语竞争的设计词汇：
  `thread`、`run`、`task`、`tool`、`approval`、`runtime`

## 次要通道含义

- `eval`
  内部确定性质量工具，不是主要用户产品路径
- `src/harness/eval/real`
  内部实时或追踪支持场景的质量工具
- `validation`
  内部治理和发布质量的评估工具封装

这些通道必须保持可运行，但不得重新定义产品架构。

## 噪音与简化说明

- 之前的根级 `index.ts` 是一个虚假入口面，已从仓库中移除。
- 旧的 `docs/active` / `docs/work-packages` / `docs/historical` 树已被淘汰。
- 新的官方知识空间位于 `docs/space/`，但它通过索引进入，不重新形成平行控制面。
- 后续清理应继续移除非运行时主轴的虚假入口文件、重复叙述和占位符封装。

## 未来变更控制门槛

在接受任何非平凡的 AI 辅助变更之前，记录：

1. 哪个主要子系统发生变更
2. 哪个入口点或脚本受影响
3. 哪些测试证明变更有效
4. 是否引入新概念、复制现有概念或扩大设计词汇
5. `CONTROL.md` 是否必须变更或编辑明确属于本地

如果变更无法清晰回答这五个问题，则不应合并。

## 二次清理清单

对于未来的清理工作，将变更精确分类为以下之一：

- 权威清理
- 入口面清理
- 子系统边界清理
- 本地实现变更

如果变更是 `权威清理` 或 `入口面清理`，记录：

1. 被降级或移除的来源
2. 存活的权威来源
3. 证明被移除或重写的面不在运行时主轴上
4. 用于验证没有行为退化的测试或检查

这可以防止清理工作变成另一轮不受控制的重写。
