# OpenPX System Execution Framework

Date: 2026-04-09
Status: Active
Related docs:
- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`
- `docs/active/future-roadmap-capability-eval-ui-platform.md`

---

## 1. Purpose

这份文档用于定义 OpenPX 的统一执行框架。

目标不是描述某一个单独功能，
而是为未来所有功能提供统一约束：

- runtime 如何定义真相
- capability 如何进入系统
- eval 如何成为质量闭环
- TUI 如何只做 operator shell
- release 与文档如何保持一致
- 未来产品化和多前端如何避免反向污染内核

这份文档是全局规则文档。  
后续任何新功能方案都必须与本文件一致。

---

## 2. Core principle

OpenPX 的统一执行原则只有一句话：

**runtime 定义真相，capability 走统一执行链，eval 提供质量闭环，UI 只消费稳定视图，版本与文档跟随协议治理。**

---

## 3. Layer model

OpenPX 后续所有功能，只能归属于以下层级之一：

1. Core Runtime / Kernel
2. Agent Capability
3. Eval / Observability
4. Operator UI
5. Workflow / Product UI
6. Versioning / Release / Compatibility
7. Documentation / Governance

任何提案在进入开发前，都必须明确自己属于哪一层。  
不允许功能跨层漂移、职责不清、或以 UI 临时补 runtime 缺口。

---

## 4. Layer 1 — Core Runtime / Kernel

### 4.1 Responsibility

Core Runtime / Kernel 是唯一底座。  
它负责：

- command intake
- session bootstrap / hydration
- runtime object lifecycle
- worker coordination
- graph invocation
- snapshot generation
- event publication
- persistence integration

### 4.2 Invariants

这层必须始终满足：

- runtime 是唯一执行真相
- snapshot 是客户端 hydration 的权威基础
- events 是增量变化，不是第二套真相
- runtime object 必须具备明确 ownership
- 所有可恢复边界必须显式建模

### 4.3 Any new runtime feature must define

任何进入 runtime 的新功能都必须回答：

- 它是什么 runtime object
- 它由谁创建
- 它何时结束
- 它如何持久化
- 它如何 replay / hydrate
- 它如何被 protocol projection 暴露

### 4.4 Forbidden patterns

不允许：

- 在 runtime 外定义核心执行真相
- 用 UI 临时状态代替 runtime state
- 用 event 补足 snapshot 缺失的核心状态
- 用隐式约定替代 lifecycle 建模

---

## 5. Layer 2 — Agent Capability

### 5.1 Responsibility

Agent capability 层负责把系统变成真正可执行的 agent system。  
但这里的能力不是“更聪明”，而是：

- 可控
- 可恢复
- 可解释
- 可归因
- 可持续迭代

### 5.2 Unified execution chain

OpenPX 中所有 agent 能力都必须进入同一条执行链：

`planner -> executor/verifier -> approval/reject -> resume -> artifact -> commit`

这条链是权威路径。  
不允许长期并存：

- graph path
- shortcut path
- ad-hoc recovery path

### 5.3 Capability invariants

所有 capability work 都必须满足：

- 每一步都能映射到稳定 runtime object
- approval / reject / resume 使用显式控制语义
- artifact 必须 package-scoped
- recovery 不能重复不可重复 side effects
- lifecycle 必须可追踪

### 5.4 Required metrics

任何 capability 改动都至少要绑定以下一类指标：

- approval resume success
- rejection replan success
- artifact ownership correctness
- interrupt/resume consistency
- duplicate side-effect rate
- hydration/replay consistency

### 5.5 Forbidden patterns

不允许：

- 为了快而保留平行控制路径
- 在控制层绕过 graph path
- 用自然语言模糊控制 approval / reject
- 用本地 heuristics 解释 runtime 结果

---

## 6. Layer 3 — Eval / Observability

### 6.1 Responsibility

Eval / Observability 负责把 OpenPX 从“能跑的 agent”
变成“能被测量、能被解释、能被迭代”的 agent system。

它不是 BI，不是附加仪表盘。  
它是 runtime 质量闭环的一部分。

### 6.2 Observability objects

默认观察五类对象：

#### A. Thread / Run / Task lifecycle
- create
- activate
- block
- complete
- resume
- fail

#### B. Worker lifecycle
- spawn
- transition
- suspend
- resume
- finish
- cancel

#### C. Tool execution / side effects
- invocation
- policy classification
- approval requirement
- outcome
- side-effect recording

#### D. Approval / Reject / Resume flow
- approval requested
- approval resolved
- rejection reason
- replan triggered
- resume path chosen

#### E. Outputs
- artifact generation
- artifact verification
- answer updates
- final outcome

### 6.3 Eval model

所有重要功能都必须考虑三层 eval：

#### Outcome eval
回答：最终做成了吗？

#### Trajectory eval
回答：过程是否健康？

#### Human review eval
回答：用户是否会信任并继续放权？

### 6.4 Minimum eval requirement

任何新功能进入开发，至少要附带：

- 1 个 scenario
- 1 个 outcome 判定
- 1 个 trajectory 规则或 review hook

### 6.5 Forbidden patterns

不允许：

- capability 先做完，eval 以后再补
- 只看最终结果，不看执行轨迹
- 用 UI 表现代替系统质量判断
- trace 长期混入无边界 debug 噪声

---

## 7. Layer 4 — Operator UI

### 7.1 Responsibility

Operator UI 是 runtime 的操作面。  
它不是第二套状态机，也不是产品皮肤。

它只负责：

1. 看见当前执行状态
2. 理解为什么阻塞
3. 在关键点审批、打断、恢复
4. 审阅过程与产物

### 7.2 Allowed scope

Operator UI 可以：

- render runtime snapshot
- subscribe stable runtime events
- submit explicit runtime commands
- hold presentational state
- organize stable views for operator efficiency

### 7.3 Forbidden scope

Operator UI 不可以：

- 本地发明 canonical task truth
- 本地发明 canonical approval truth
- 本地发明 canonical answer truth
- 用聊天文本解析业务控制语义
- 用 heuristics 重建 authoritative history

### 7.4 Standard panels

Operator UI 的标准面板集合：

- Execution panel
- Approval panel
- Recovery panel
- Artifact panel
- Stable event timeline

### 7.5 Success criteria

Operator UI 成功的标准不是“更好看”，而是：

- 用户不看完整 transcript 也知道当前状态
- 用户知道为什么停住
- 用户知道下一步怎么干预
- 用户能快速审阅输出
- UI 不拥有竞争性业务真相

---

## 8. Layer 5 — Workflow / Product UI

### 8.1 Responsibility

这层负责在 Operator UI 稳定之后，
增加更高层的工作流效率与产品体验。

包括：

- thread navigation
- search / filtering
- history browsing
- summaries / comparison
- onboarding
- settings
- polish

### 8.2 Constraint

这一层不能反向驱动 runtime semantics。  
如果某个产品 UI 需求要求 UI 自己补 runtime truth，则应回退到 runtime/view 层解决。

### 8.3 Priority rule

若某项 UI 工作：

- 不提升监督能力
- 不提升恢复能力
- 不提升审阅效率

则应视为后置项，而非当前主线。

---

## 9. Layer 6 — Versioning / Release / Compatibility

### 9.1 Responsibility

这层保证：

- 协议变更有边界
- 行为变更有记录
- 发布有一致性门槛
- 客户端兼容有明确规则

### 9.2 Version model

OpenPX 采用三条版本线：

#### A. Protocol version
用于 command / event / snapshot schema 兼容性。

#### B. Behavior version
用于执行语义、approval 语义、recovery 语义变化记录。

#### C. Doc version
用于 active docs 与当前行为的一致性治理。

### 9.3 Release gates

每个 release 至少通过以下 gate：

1. protocol/schema tests
2. core runtime flow tests
3. scenario eval pass
4. docs sync complete
5. release notes include breaking / behavior / doc changes

### 9.4 Compatibility rule

任何 breaking protocol change 都必须：

- 显式标记
- 说明迁移路径
- 更新 active docs
- 更新 release notes
- 更新相关 scenario/eval

---

## 10. Layer 7 — Documentation / Governance

### 10.1 Responsibility

这一层负责全局一致性治理。  
目标是确保：

- 只有一个当前主线
- 文档不和实现互相背离
- 每次版本更新都能同步文档与行为

### 10.2 Document hierarchy

OpenPX 只承认如下层级：

`AGENTS.md`
-> `ROADMAP.md`
-> `docs/active/*`
-> `docs/work-packages/*`
-> `docs/historical/*`

低优先级文档不得覆盖高优先级文档。

### 10.3 Mandatory template

所有新功能文档都必须至少包含：

- Goal
- Invariants
- Scope
- Non-goals
- Protocol impact
- Tests / evals
- Docs to update
- Exit criteria

### 10.4 Governance rule

任何功能进入开发前，必须回答：

1. 它属于哪一层？
2. 它是否引入新的 runtime truth？
3. 它是否影响 protocol？
4. 它的最小 eval 是什么？
5. 它影响哪些 active docs？
6. 它的 exit criteria 是什么？

只要这 6 个问题答不清，就不进入开发。

---

## 11. Cross-layer invariants

以下约束跨所有层生效：

### Invariant 1
runtime 定义真相，UI 不得竞争真相。

### Invariant 2
所有 capability 都必须进入统一执行链。

### Invariant 3
所有重要能力都必须具备最小 eval。

### Invariant 4
所有 UI 先服务监督与恢复，再服务产品完整度。

### Invariant 5
所有协议变化都必须同步版本、测试、文档。

### Invariant 6
任何历史文档都不能和当前 active baseline 竞争。

---

## 12. Decision framework

以后遇到路线分歧时，统一按以下顺序判断：

### Question 1
这项工作是否提升了“可控能力”？

### Question 2
这项工作是否提升了“可测能力”？

### Question 3
这项工作是否提升了“可监督性”？

### Question 4
这项工作是否建立在稳定协议之上？

### Question 5
这项工作是否会制造第二套真相？

若 Question 5 的答案是“会”，则应直接回退重构。

---

## 13. Success definition

当以下条件长期成立时，说明全局执行框架运转正常：

- runtime 是唯一真相源
- capability 沿统一执行链增长
- eval 能跟上能力演进
- TUI / UI 只做 operator shell 与工作流层
- 版本变更、发布、文档更新保持同步
- 不再出现平行路线图和平行状态模型

---

## 14. Short version

OpenPX 的长期一致性来自一条统一规则：

**内核定义真相，能力进入统一执行链，评估形成闭环，UI 只做操作面，版本与文档跟协议一起治理。**