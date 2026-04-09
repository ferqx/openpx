# OpenPX TUI Execution Plan

Date: 2026-04-09
Status: Active
Related docs:
- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/system-execution-framework.md`
- `docs/active/future-roadmap-capability-eval-ui-platform.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## 1. Purpose

这份文档用于定义 OpenPX 的 TUI 专项执行方案。

目标不是把 TUI 做成一个独立产品线，
而是明确：

- TUI 的使命是什么
- TUI 可以做什么
- TUI 不可以做什么
- TUI 未来如何迭代
- TUI 如何与 runtime、eval、版本、文档保持一致

---

## 2. Mission

TUI 的使命只有一句话：

**TUI 是 OpenPX runtime 的 operator shell。**

它负责：

- 渲染稳定 runtime truth
- 提供 operator 级交互入口
- 支持审批、打断、恢复、审阅
- 提高长任务监督效率

它不负责：

- 定义业务真相
- 重建 authoritative history
- 自行解释 runtime 缺失语义
- 变成先于内核的产品化主线

---

## 3. Product position

### TUI is

- operator console
- runtime shell
- recovery surface
- approval surface
- artifact review surface

### TUI is not

- second state machine
- chat-driven control interpreter
- product-first visual shell
- patch layer for missing runtime semantics

---

## 4. Core invariants

### Invariant 1 — TUI consumes truth, not invents truth

TUI 只能消费：

- stable snapshot
- stable view objects
- stable commands
- stable event projections

### Invariant 2 — TUI holds presentational state only

TUI 可以持有：

- focus
- selection
- layout state
- scroll state
- local visibility toggles
- transient input buffer

TUI 不应持有：

- canonical task truth
- canonical approval truth
- canonical answer truth
- canonical event history

### Invariant 3 — TUI commands must be explicit

TUI 发出的控制动作必须是显式 runtime command，  
而不是依赖模糊聊天式文本解释。

### Invariant 4 — TUI should optimize operator cognition

TUI 的价值在于帮助用户更快理解：

- 当前在做什么
- 为什么停住
- 能否继续
- 继续后会发生什么
- 当前产物是否可信

---

## 5. Allowed scope

TUI 允许承担的职责：

### A. Render runtime state
- thread summary
- run state
- task state
- worker state
- approval state
- artifact state
- answer state

### B. Organize operator views
- execution overview
- approval detail
- recovery detail
- artifact review
- event timeline

### C. Submit explicit actions
- approve
- reject
- interrupt
- resume
- switch focus
- inspect detail

### D. Hold presentation logic
- keyboard navigation
- layout composition
- panel visibility
- local interaction affordances

---

## 6. Forbidden scope

TUI 禁止承担以下职责：

### A. Business truth synthesis
不允许本地发明：

- canonical task state
- canonical approval meaning
- canonical answer lineage
- authoritative conversation history

### B. Chat-like control parsing
不允许把自然语言输入直接解析成系统控制语义，
例如：

- 从“yes / ok / 可以”推导正式 approval command
- 从模糊自由文本推导 reject / resume 语义

### C. State repair by heuristics
不允许用前端 heuristics 修补 runtime/view 缺口。

### D. Hidden control shortcuts
不允许 UI 为了体验临时引入绕过统一执行链的捷径。

---

## 7. Standard UI surfaces

TUI 的标准结构固定为 5 个主要面板。

### 7.1 Execution panel

目的：
帮助用户快速理解“现在系统正在做什么”。

展示内容：
- current thread
- active run
- active task
- owner worker
- current phase
- blocked / running / waiting approval / completed 状态

成功标准：
- 用户无需阅读完整 transcript 即可知道当前执行位置

### 7.2 Approval panel

目的：
帮助用户做出明确审批决策。

展示内容：
- pending approval
- risk classification
- expected effect
- affected target
- available actions
- post-approval expectation

成功标准：
- 用户知道为什么当前需要审批
- 用户知道批准或拒绝后会发生什么

### 7.3 Recovery panel

目的：
帮助用户理解“为什么停住，以及如何继续”。

展示内容：
- blocked reason
- resumability state
- resume options
- latest failure boundary
- retry / replan / cancel choices

成功标准：
- 用户知道当前能否恢复
- 用户知道应该如何恢复

### 7.4 Artifact panel

目的：
帮助用户审阅当前 package 的输出。

展示内容：
- current package artifacts
- verification status
- commit status
- latest answer linkage
- package ownership context

成功标准：
- 用户能快速知道当前产物是否可靠、是否属于当前工作单元

### 7.5 Stable event timeline

目的：
帮助用户理解关键状态演化。

展示内容：
- stable object changes
- phase transitions
- approval / recovery milestones
- artifact / answer milestones

不展示：
- 无语义价值的内部噪声事件
- 会误导业务判断的低层 debug 流

成功标准：
- 时间线能帮助理解与排障，而不是制造信息噪声

---

## 8. TUI view model

TUI 只能基于稳定 view model 渲染。  
建议长期固定以下视图族：

- `ThreadView`
- `RunView`
- `TaskView`
- `WorkerView`
- `ApprovalView`
- `AnswerView`
- `ArtifactView`
- `RuntimeSnapshotView`

如果 TUI 需要新的业务信息，优先新增或修正 view model，  
而不是在 TUI 本地派生临时 truth。

---

## 9. TUI command model

所有 TUI 控制动作都必须是显式 command：

- `ApproveCommand`
- `RejectCommand`
- `InterruptCommand`
- `ResumeCommand`
- `InspectCommand`
- `FocusCommand`

规则：

- command 必须可追踪
- command 必须进入 runtime
- command 必须可被 replay / audit / eval
- command 语义必须独立于文本输入习惯

---

## 10. TUI development milestones

### M1 — Thin TUI

目标：
削掉 TUI 本地业务语义，让 TUI 回到 shell 身份。

重点：
- 去掉聊天式 approval 解释
- 去掉本地 canonical truth 派生
- 用 stable view 替代本地拼装

退出标准：
- TUI 不再发明 approval / answer / task truth
- runtime snapshot 足以支撑 hydration

### M2 — Operator shell completeness

目标：
补齐标准 operator panels。

重点：
- execution panel
- approval panel
- recovery panel
- artifact panel
- stable event timeline

退出标准：
- 用户能完成看状态 / 批准 / 打断 / 恢复 / 审阅这五类操作

### M3 — Workflow ergonomics

目标：
在不破坏 shell 边界前提下提高日常效率。

重点：
- navigation
- filtering
- inspection shortcuts
- operator productivity affordances

退出标准：
- 操作效率提升但未引入第二套真相

### M4 — Product polish / handoff readiness

目标：
为未来产品 UI 或多前端提供稳定 handoff 基础。

重点：
- layout cleanup
- interaction polish
- frontend handoff discipline
- documentation alignment

退出标准：
- TUI 行为与 view contract 稳定
- 未来 frontend 可复用相同稳定对象

---

## 11. TUI work package template

以后所有 TUI work package 必须使用以下模板：

### Goal
这个改动想提升什么 operator 能力？

### Invariants
它是否遵守：
- TUI 不发明 truth
- command 显式化
- runtime view 优先

### Scope
它具体涉及哪些 panel / interactions / view bindings？

### Non-goals
它不会解决什么？

### Runtime impact
是否需要新增 view、command、event projection？

### Eval hooks
如何判断它真的变好？
至少一个：
- diagnosis time
- approval resolution clarity
- recovery success after intervention
- artifact review completeness

### Docs to update
需要同步哪些 active docs / work packages？

### Exit criteria
改动完成的可验证标准是什么？

---

## 12. TUI release and compatibility rules

任何 TUI 变更只要涉及以下内容，就必须触发版本/兼容性评估：

- stable panel semantics changes
- command semantics changes
- required view shape changes
- approval/recovery interaction changes

TUI release 不只看视觉回归，还必须看：

- runtime compatibility
- command correctness
- hydration consistency
- eval hooks intact
- docs sync complete

---

## 13. Anti-patterns

以下行为属于 TUI 反模式：

### Anti-pattern 1
“runtime 暂时没有，我先在 TUI 算一下”

### Anti-pattern 2
“用户输入 yes/no 很方便，就先这么解析”

### Anti-pattern 3
“为了看起来完整，先在 UI 补一层流程”

### Anti-pattern 4
“这个只是展示层，不用更新 active docs”

### Anti-pattern 5
“这个行为变了，但不算 breaking change”

---

## 14. Decision framework for TUI changes

以后遇到 TUI 路线争议时，按下面顺序判断：

### Question 1
这项改动是否提升了 operator 的监督、恢复或审阅能力？

### Question 2
它是否依赖新的 runtime truth？

### Question 3
若依赖新的 runtime truth，这个 truth 是否应先进入 runtime/view model？

### Question 4
它是否引入了本地 heuristic 解释？

### Question 5
它是否会破坏统一执行链或命令语义？

若 Question 4 或 Question 5 的答案是“会”，则该方案应回退。

---

## 15. Success definition

当以下条件成立时，说明 TUI 专项方案执行正确：

- TUI 成为稳定 operator shell
- TUI 不再持有竞争性业务真相
- approval / recovery / artifact review 都有清晰表面
- 用户能高效监督长任务执行
- TUI 可以随 runtime/view evolution 平稳演进
- 后续 Workflow UI / Product UI 可以建立在稳定 shell 之上

---

## 16. Short version

OpenPX 的 TUI 不是产品壳层，  
而是 runtime 的 operator shell。

它只做三件事：

- 展示稳定 truth
- 提交显式 command
- 提升监督、恢复、审阅效率

除此之外的事情，优先交给 runtime、view model、eval 或后续产品层。