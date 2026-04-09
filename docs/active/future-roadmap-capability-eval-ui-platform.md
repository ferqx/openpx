# OpenPX Future Roadmap: Capability, Eval, UI, and Platform

Date: 2026-04-09
Status: Active
Related docs:
- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## Purpose

这份文档回答一个具体问题：

在 OpenPX 内核主线明确之后，
后续的 **能力层、评估层、UI 层、平台层** 应该如何排序与推进。

它不是新的平行路线图。  
它是对现有 roadmap 的展开。

---

## Strategic conclusion

OpenPX 的后续最优路线不是：

`Agent capability -> UI -> eval`

而是：

`Agent capability x eval/observability -> operator UI -> hardening -> product/platform`

也就是说：

1. 先把 agent 做成 **可控、可恢复、可解释** 的系统
2. 同时把评估层做成 runtime 的组成部分
3. 再把 UI 做成监督与操作面
4. 最后做产品化与多前端扩展

---

## Positioning

### What OpenPX is

OpenPX 是一个面向长时代码工作的本地 Agent OS。

它首先应该是：

- 一个本地、可恢复、可中断、可继续的 agent runtime
- 一个 long-running work 的 control plane
- 一个以 protocol / snapshot / event stream 为核心的系统
- 一个 CLI-first、TUI-first 的 operator shell

### What OpenPX is not right now

当前阶段，OpenPX 不是：

- 一个以产品 UI 完整度为主的项目
- 一个优先追求 Web / IDE / Desktop 接入的项目
- 一个允许 UI 与 runtime 竞争业务真相的系统
- 一个先做“看起来完整”再补执行闭环的项目

---

## Sequencing principles

### 1. Capability first, but only as measurable capability

能力不是抽象上的“更聪明”，而是：

- 是否能在统一执行模型下持续完成任务
- 是否能正确处理中断、审批、恢复、重试
- 是否能把每一步归因到明确的 runtime object
- 是否能被持续评估与改进

### 2. Eval is a first-class layer

评估层不是后续的 BI 或仪表盘。  
它应从这一阶段开始进入 runtime 设计。

### 3. UI starts as operator UI

OpenPX 的下一阶段 UI 应优先帮助用户：

- 看见 agent 当前在做什么
- 理解为什么停下
- 在关键点审批或打断
- 在失败后恢复执行
- 审阅过程与产物

### 4. Platformization sits on stable protocol

VSCode / Web / Desktop / SDK / ecosystem  
都应建立在稳定 protocol、snapshot、events、worker lifecycle 之上。

---

## Phase A — Capability Core

### Goal

把 OpenPX 的 agent 能力从“可运行”提升为“可控、可恢复、可解释”。

### Scope

#### A. Unified execution model

planner、executor、verifier、approval、reject、resume、artifact、commit  
必须走统一执行路径。

系统中不应长期存在 graph path 与 shortcut path 并存。

#### B. Explicit worker lifecycle

worker 成为第一类 runtime 对象，并具备稳定语义：

- spawn
- resume
- cancel
- join
- inspect

所有活动工作单元都必须能归因到：

- `thread_id`
- `task_id`
- `worker_id`（如适用）

#### C. Recovery as capability

以下行为都属于核心能力范围：

- interrupt
- hydrate
- replay
- resume
- restart recovery

#### D. Explicit approval semantics

approval / reject / resume  
不能依赖模糊聊天式控制。  
控制动作必须来自稳定命令模型。

### Deliverables

- graph-backed execution loop 完整闭环
- package-scoped artifact flow 收口
- worker lifecycle 稳定对外可见
- approval/reject/resume 语义统一
- replay / hydration / interrupt-resume 一致
- side effects 完整纳入 policy + ledger 路径

### Exit criteria

- approve / reject / resume 都通过统一模型执行
- artifact 不再跨 package 泄漏
- 中断恢复不会重复执行不可重复 side effects
- 任务执行过程可归因到稳定 runtime objects
- snapshot hydration 与实时状态一致
- runtime 真相不需要 UI 本地推导补全

### Non-goals

- 重产品 UI
- 多前端接入
- 视觉壳层重设计
- 为演示而增加不稳定能力面

---

## Phase B — Eval and Observability

### Goal

把 OpenPX 从“能运行的 agent”提升为“可测量、可解释、可持续改进的 agent system”。

### Why this phase is early

如果能力层先增长，而评估层长期缺席，最终会出现：

- 不能判断能力是否真的提升
- 不能定位失败来自 prompt、tool、policy 还是 orchestration
- 不能筛选高价值失败样本
- 无法形成稳定迭代飞轮

### Observability scope

建议固定观察五类对象：

#### A. Thread / Run / Task lifecycle
- 创建
- 激活
- 阻塞
- 完成
- 恢复
- 失败

#### B. Worker lifecycle
- spawn
- transition
- suspend
- resume
- finish
- cancel

#### C. Tool execution and side effects
- invocation
- risk classification
- approval requirement
- execution outcome
- side effect recording

#### D. Approval / Reject / Resume flow
- approval requested
- approval resolved
- rejection reason
- resume path chosen
- replan triggered

#### E. Outputs
- artifact generation
- artifact verification
- answer updates
- final outcome

### Eval model

#### Layer 1 — Outcome eval

回答：**最后做成了吗？**

指标示例：

- task 完成率
- answer 与目标一致率
- artifact 归属正确率
- approval 后恢复成功率
- reject 后 replan 成功率

#### Layer 2 — Trajectory eval

回答：**过程是否健康？**

指标示例：

- 是否走错 graph path
- 是否出现多余 tool calls
- 是否请求了不必要 approval
- 是否遗漏了必要 approval
- 是否错误切换 runtime phase
- 恢复后是否重复副作用

#### Layer 3 — Human review eval

回答：**对用户而言，这次协作是否可信、可控、值得继续放权？**

指标示例：

- approval 提示是否清楚
- blocked reason 是否可审阅
- answer 是否可信
- 用户是否频繁打断
- 用户在哪些节点失去信任

### System components

- `trace store`
- `scenario suite`
- `grader layer`
- `review queue`

### Exit criteria

- 核心任务有固定 scenario suite
- outcome eval 可自动运行
- trajectory eval 能发现明显控制流问题
- human review 有稳定入口
- 关键失败可从 trace 追到 runtime object
- 每次能力改动都能获得可对比反馈

---

## Phase C — Operator UI

### Goal

把 TUI / future UI 发展为 agent 的操作面，
而不是第二套状态机，也不是以视觉完整度为目标的产品壳层。

### UI philosophy

Operator UI 只负责：

1. 看见当前执行状态
2. 理解当前阻塞/风险点
3. 在需要时审批、打断、恢复
4. 审阅过程与产物

### What to build first

#### A. Execution panel
- 当前 thread
- active run
- active task
- owner worker
- current phase

#### B. Approval panel
- 当前 approval
- 风险分类
- 影响范围
- 执行后会发生什么
- 可选动作

#### C. Recovery panel
- blocked reason
- resume options
- 最近失败边界
- 当前可恢复性状态

#### D. Event timeline
展示稳定事件与阶段变化，而不是所有内部噪声。

#### E. Artifact panel
- 当前 package artifacts
- verification state
- commit state
- latest answer linkage

### Design rules

- 只消费 stable views
- 不自行发明 canonical task truth
- 不自行发明 canonical approval truth
- 不自行发明 canonical answer truth
- 不以本地 heuristics 重建 authoritative history

### Not now

这一阶段不优先做：

- 复杂视觉 redesign
- 产品级 onboarding
- 丰富个性化设置
- 跨端适配
- 纯展示型 dashboard

### Exit criteria

- 用户能够不读完整 transcript 也知道系统当前状态
- 用户能够定位为什么阻塞
- 用户能够在关键时刻审批/打断/恢复
- 用户能够审阅当前产物与最近一步结果
- UI 不再拥有竞争性业务真相

---

## Phase D — Hardening

### Goal

把系统从“能用”推进到“稳用”。

### Scope

#### A. Runtime daemon stability
- daemon reuse
- reconnect
- restart recovery
- session reattachment

#### B. Recovery correctness
- hydrate consistency
- replay correctness
- interrupt/resume consistency
- idempotent recovery boundaries

#### C. Multi-workspace correctness
- workspace isolation
- cross-workspace daemon semantics
- session reuse constraints

#### D. Regression infrastructure
- protocol regression suite
- runtime/control regression suite
- approval/recovery regression suite
- operator UI compatibility regression suite

### Exit criteria

- reconnect 不会引入第二套 truth
- restart 后 shell 可复原核心状态
- replay 与实时状态保持一致
- recovery paths 具备自动化测试覆盖
- 常见失败路径可以稳定重现和修复

---

## Phase E — Product and Platform

### Product layer

在能力、评估、操作面、稳定性都达标后，再推进：

- quickstart
- onboarding
- default configuration
- release checklist
- user-facing docs cleanup
- workflow convenience features

### Workflow UI

在 operator UI 之后，再逐步增加：

- thread navigation
- search and filtering
- history browsing
- result comparison
- summary/narrative browsing
- productivity shortcuts

### Platform layer

最后才考虑：

- VSCode integration
- Web shell
- Desktop shell
- runtime protocol SDK
- plugin/tool ecosystem
- collaboration and permission model
- remote control plane exploration

### Constraint

平台层的前提是：

- stable protocol
- stable snapshot model
- stable event semantics
- stable worker lifecycle
- stable eval/trace foundation

---

## Decision framework

当出现路线争议时，按下面顺序判断：

### Question 1
这项工作是否提升了“可控能力”？

### Question 2
这项工作是否提升了“可测能力”？

### Question 3
这项工作是否帮助用户更好地监督 agent？

### Question 4
这项工作是否建立在稳定协议之上？

---

## Success definition

当下面这些事情成立时，说明 OpenPX 进入下一阶段：

- agent 执行链统一，approval/reject/resume 完整闭环
- runtime snapshot / events 成为唯一真相源
- outcome eval、trajectory eval、human review eval 全部起盘
- operator UI 成为稳定控制台，而不是第二状态机
- reconnect / recovery / replay 具备稳定性
- 产品化与多前端扩展可以低风险推进

---

## Short version

OpenPX 的后续路线应当是：

1. 把 agent 能力做成可控、可恢复、可解释的能力
2. 把评估层做成 runtime 的组成部分
3. 把 UI 先做成 operator shell，而不是产品皮肤
4. 把稳定性做扎实
5. 最后再推进产品化与平台化