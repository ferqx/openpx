# OpenPX Minimal Real Eval Checklist

Date: 2026-04-09
Status: Working
Related docs:
- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/eval-system-framework.md`
- `docs/active/system-execution-framework.md`

---

## Purpose

这份清单只解决一个问题：

**在当前阶段，用最小 real agent eval 验证统一执行链是否成立。**

它不试图建立完整评估平台，
也不覆盖所有未来能力。

当前只围绕 4 个真实场景展开：

1. approval 后继续执行
2. reject 后 replan / resume
3. artifact 属于当前 work package
4. interrupt / resume 后状态一致

这份清单定义的是 **最小 real agent eval lane**，
不是通用 eval foundation，也不是默认 `eval:core` gate。

---

## Positioning relative to `src/eval/` foundation

这份文档描述的不是通用 eval foundation，
也不是默认的 deterministic regression lane。

OpenPX 目前至少存在两类评估通道：

### A. Foundation eval lane

面向：

- deterministic checks
- protocol / schema / snapshot correctness
- narrow scenario regression
- fast CI / local repeatability

特点：

- 优先使用 fixtures / replay / deterministic assertions
- 追求快、稳、可高频运行
- 可以作为默认 `eval:core` 或 release-facing baseline 的一部分

### B. Real agent eval lane

面向：

- 真实 agent 行为验证
- 真实模型 + 真实工具 + 真实控制流下的端到端表现
- 验证“系统在真实运行条件下是否仍然成立”

特点：

- 运行更慢
- 成本更高
- 方差更大
- 不适合作为默认快速 gate
- 主要服务于开发侧确认、行为回归验证、设计决策复核

本文件定义的是 **B. Real agent eval lane**。
它建立在 foundation eval 已存在的前提上，但不替代 foundation eval。

---

## Scope

### In scope

- scenario 定义
- outcome checks
- trajectory rules
- minimum trace requirements
- minimum review queue

### Out of scope

- 通用 benchmark
- 大规模 dashboard
- 重度 LLM judge
- 完整在线评估平台
- 与 UI 强绑定的评估产品层

---

## Realness definition

本文件中的 “real” 不是泛指“看起来像真的”，
而是明确区分以下三类真实度：

### 1. Real model

Real model 指：

- 通过真实 model gateway / provider adapter 发起调用
- 使用当前实际接入的模型配置与推理接口
- 输出来自真实模型采样，而不是 fixture / canned response / stubbed completion

不要求：

- 必须是生产环境同一账号
- 必须是最高成本模型
- 必须完全关闭安全或速率保护

允许：

- 使用专用 eval model config
- 使用受控 temperature / token budget
- 使用专用开发凭证

### 2. Real tool

Real tool 指：

- 走真实 tool invocation path
- 经过真实 policy / approval / execution plumbing
- 由真实 runtime 执行，而不是直接 mock 成“成功结果”

不要求：

- 必须命中不可逆的外部生产系统
- 必须对真实用户环境造成副作用

允许：

- 在 sandbox workspace / test repo / disposable environment 中执行
- 对高风险、不可逆、昂贵工具使用受控替身环境
- 对必须隔离的 side effect 使用真实协议路径 + 安全沙箱目标

换句话说：

**tool path 必须真实；tool target 可以是受控目标。**

### 3. Real run data

Real run data 指：

- 一次真实 agent run 产生的 snapshot / events / artifacts / answers / trace
- 数据来自真实运行，而不是手写 transcript

允许：

- 对真实 run data 做 replay、切片、归档和比较
- 将历史真实运行沉淀为 review item 或 scenario seed

不要求：

- 每次都从零实时生成全部数据
- 每个检查都必须 live run

---

## What must be real vs what may be replayed

### Must be real in this lane

以下至少有两项必须是真实的，才能算 real agent eval：

- model invocation
- tool path / control path
- run trace / output data

默认优先要求：

- real model
- real tool path
- real runtime trace

### May be replayed

以下内容允许 replay 或复用历史真实运行结果：

- trajectory inspection
- outcome re-check
- trace-based diagnostics
- review queue triage
- flaky case comparison
- post-run rubric grading

### Not considered real enough

以下情况不应算作 real agent eval：

- model output 全部由 fixture / stub 提供
- tool execution 被直接 mock 成理想结果
- 只有手写 transcript，没有真实 runtime trace
- 只检查 UI 展示，不检查真实 control path

---

## Global rule

当前阶段的真实评估只回答两类问题：

1. **结果有没有做成**
2. **过程有没有走对**

如果不能帮助判断这两件事，就不属于当前最小真实评估范围。

---

## Real eval as evolution and promotion input

当前阶段，real eval 不只是产出 `passed / failed / suspicious`。

它还必须产出两类工程输入：

- `evolution input`
  - 说明这次真实失败属于哪个 capability gap
  - 说明下一步应该修 planner、runtime、eval rule，还是 scenario
- `promotion input`
  - 说明某个 capability family 是否已经稳定到可以进入 foundation guardrails

也就是说：

- real eval 负责发现真实失败，并推动能力收口
- foundation eval 负责把已收口能力变成更快的常规守门回归

当前阶段不允许把 real eval 只当成慢速演示命令使用。

---

## When a live scenario is considered stabilized

某个 live scenario family 只有在同时满足以下条件后，才应视为“已稳定”：

- 同一 family 的关键 live scenario 已复跑通过
- 真实失败已经被解释到明确的 capability gap / system layer
- 对应更快 guardrails 已补到 foundation lane

当前阶段，`promotion_ready` 只是一种工程治理语义，
不等于默认 CI gate，也不等于 release blocker。

它只表示：

- 这条真实能力链路已经被 live real eval 验证过
- 这次 live 修复已经被沉淀成更快回归
- 后续日常守门可以主要依赖 foundation lane，real lane 改为周期性真实性复核

---

## Promotion workflow

后续所有 real-eval 修复，统一按以下顺序推进：

1. real eval 暴露真实失败
2. failure taxonomy 映射到 capability gap
3. 修 planner / runtime / control path
4. 为该失败补至少一个更快 regression
5. 复跑同一个 live scenario
6. 若 family 稳定通过且 guardrails 已存在，标记 `promotion_ready`
7. foundation lane 负责常规守门，real lane 负责周期性真实性复核

禁止：

- live run 修好了但不补 foundation regression
- foundation regression 绿了却不复跑 live scenario
- 把一次偶然 live pass 当成能力 closure

---

## Execution mode and non-goals

### Execution mode

这条 real agent eval lane 的执行模式是：

- 慢速
- 开发侧
- 有成本感知
- 用于验证关键行为，而不是替代快速回归

它主要用于：

- 新控制语义落地后的真实性验证
- foundation eval 通过后，对真实 agent 行为做补充确认
- 可疑行为回归复核
- release 前的少量高价值抽检
- 将真实失败沉淀为后续 scenario / grader / docs 输入

### Default trigger points

默认在以下时机运行：

- approval / reject / resume 语义发生变化后
- artifact ownership / package scoping 语义变化后
- recovery / replay / hydration 语义变化后
- 引入新的高风险工具路径后
- foundation eval 通过但团队仍怀疑真实行为可能漂移时

### Non-goal

这条 lane 当前不是：

- 默认 `eval:core` gate
- 默认每次提交都跑的 CI 套件
- release blocking 的唯一依据
- 通用 benchmark 系统
- 成本无限制的 stress platform
- 产品化 dashboard

### Relationship to core gates

当前阶段的默认顺序应当是：

1. foundation / deterministic eval 先过
2. real agent eval 再作为慢速验证通道补充
3. 若 real lane 暴露问题，则回流到 scenario / rule / runtime fix

也就是说：

**real agent eval 当前是开发侧真实性验证通道，不是默认快速门禁。**

### Real eval as evolution input

当前阶段，real eval 还有一个额外职责：

- 把真实失败转成 capability gap
- 把 capability gap 转成当前 roadmap 的 work package 输入
- 把修复后的问题沉淀为更快的 deterministic/runtime regression

因此 real eval 的 primary output 不只是：

- `passed`
- `failed`
- `suspicious`

它还必须回答：

- 失败属于哪个 capability family
- 失败更像 planner normalization、approval/reject control、artifact truth，还是 recovery consistency 问题
- 下一步应该优先修 planner、runtime，还是 eval harness

当前阶段，这条闭环只服务于 `ROADMAP.md` 的 M1 execution loop 收口，
不单独扩张为新的产品平台。

---

## Scenario model for real work loops

这 4 个 scenario 不应只被实现成“控制语义切片测试”。
它们必须以真实任务外壳运行，同时覆盖对应控制语义。

换句话说：

- 外层是一个真实工作目标
- 内层验证 approval / reject / artifact / recovery 等核心机制

当前阶段每个 scenario 都应满足：

- 有明确用户目标，而不是只写控制条件
- agent 需要真实调用模型与工具完成该目标
- outcome 与 trajectory 都能绑定到 runtime object

### Recommended real-task shells

#### Scenario A shell

一个需要审批的真实开发任务，例如：

- 修一个需要写文件的 bug
- 修改代码后补测试并验证

控制语义覆盖：

- approval required
- approved execution re-enters graph

#### Scenario B shell

一个包含 plan / implement 候选路径、且审批可能被拒绝的任务，例如：

- 先产出计划，再尝试执行某一步
- 用户拒绝风险动作后，agent 需要 replan 并继续

控制语义覆盖：

- reject
- replan
- resume

#### Scenario C shell

一个会产生明确 artifact 的真实工作任务，例如：

- 生成 patch / answer / verification output
- 需要确认 artifact 属于当前 active work package

控制语义覆盖：

- current package scoping
- artifact ownership correctness

#### Scenario D shell

一个会跨中断边界的真实长任务，例如：

- 计划后执行到一半中断
- hydrate / replay / resume 后继续完成

控制语义覆盖：

- interrupt
- recovery
- resume consistency

---

## Task 1 — Fix the 4 real scenarios

先固定以下 4 个 scenario，不继续扩张。
每个 scenario 都必须同时满足：

- 一个真实任务目标
- 一个主 outcome question
- 一个主 trajectory question
- 一个明确的 trace boundary

### Scenario A — Approval-gated bugfix loop

目标：

- agent 处理一个真实 bugfix 任务
- 在需要 approval 的节点暂停
- 批准后继续完成修改、验证与收尾

验收：

- approval 后没有走 control-plane shortcut
- 工具执行与后续产物生成可追踪

### Scenario B — Reject-and-replan task loop

目标：

- agent 先提出计划或执行候选动作
- 用户拒绝风险步骤后，agent 重新规划并继续推进真实任务

验收：

- rejection 不直接终止整个任务
- planner-facing re-entry 成立

### Scenario C — Current-package artifact loop

目标：

- agent 在当前 active work package 内完成真实任务并生成 artifact
- 旧 package 的 artifact 不得被误认成当前 truth

验收：

- artifact ownership 正确
- answer / artifact / commit 关联一致

### Scenario D — Interrupt-resume work loop

目标：

- agent 在真实长任务中被中断
- 恢复后继续完成，且可见状态与预期一致

验收：

- 不重复不可重复 side effects
- hydration / replay / resume 不发生明显漂移

---

## Task 2 — Add one outcome check per scenario

每个 scenario 只加一个最关键的结果判定。

### Scenario A — Approval-gated bugfix loop

Outcome check:

- approved execution 是否成功回到 graph 内继续完成目标

### Scenario B — Reject-and-replan task loop

Outcome check:

- reject 后是否进入正确 replan / resume，而不是直接终止

### Scenario C — Current-package artifact loop

Outcome check:

- artifact 是否属于正确 `currentWorkPackageId`

### Scenario D — Interrupt-resume work loop

Outcome check:

- resume 后是否到达预期最终状态或预期中间状态

### Rule

优先使用代码断言或规则断言。
能 deterministic 判定的，不先上 model grader。

---

## Task 3 — Add one trajectory rule per scenario

每个 scenario 至少补一个过程规则。

### Scenario A — Approval-gated bugfix loop

Trajectory rule:

- approved execution 不得绕过 graph path

### Scenario B — Reject-and-replan task loop

Trajectory rule:

- rejection 不得走 control-plane short-circuit

### Scenario C — Current-package artifact loop

Trajectory rule:

- 当前 routing / verification 不得读取上一个 package 的 artifact 作为当前 truth

### Scenario D — Interrupt-resume work loop

Trajectory rule:

- recovery 后不得重复 side effects
- hydration / replay 可见状态不得漂移

### Rule

trajectory rule 的目标不是覆盖所有过程细节，
而是先抓最危险的控制流错误。

---

## Task 4 — Keep trace minimal but useful

当前 trace 只要求记录足够支持回放和归因的信息。

### Required trace fields

- `thread_id`
- `run_id`
- `task_id`
- `worker_id`（如适用）
- user goal / scenario id
- approval requested / resolved
- rejection reason / replan entry
- artifact generated / verified / committed
- phase transitions
- recovery boundary
- resume boundary
- side-effect milestone

### Not required right now

- 全量 debug dump
- UI-only transient state
- 大而全的 timeline database

### Success condition

trace 必须能回答：

- 这次运行属于谁
- 它在执行哪个真实任务
- 关键状态在哪一步变化
- approval / reject / resume 发生了什么
- artifact 在哪一步被生成和归属
- recovery 是否跨过了正确边界

---

## Task 5 — Reuse eval infrastructure but keep a separate lane entrypoint

不要新建独立评估平台，
但也不要把 real lane 隐式并入默认 deterministic gate。

### Reuse from foundation

可以复用：

- scenario/result object model
- trace persistence
- outcome assertion helpers
- trajectory rule helpers
- review queue persistence

### Must stay separate

必须分开的内容：

- real lane entrypoint
- real lane suite id
- live run orchestration
- cost / credential / sandbox controls

### Rule

当前阶段，评估入口优先是：

- 独立的 real eval command 或 suite entrypoint
- scenario replay
- post-run regression inspection

而不是：

- dashboard
- 单独产品 UI
- 复杂评估服务

### Success condition

每次改 approval / reject / artifact / recovery 主链时，
都能用同一批 real scenarios 重跑并得到可比较结果，
且不会污染默认 `eval:core` 快速门禁。

---

## Task 6 — Create a minimal review queue

review queue 当前只收高价值失败。

### Allowed failure classes

- approval 没回 graph
- rejection 没进入 replan
- artifact package 错配
- interrupt / resume 状态漂移
- 重复 side effect
- real run 与 replay inspection 明显不一致

### Each review item should include

- scenario id
- run id
- failure class
- impacted object
- severity
- next suggested action

### Allowed next actions

- 补 scenario
- 补 outcome check
- 补 trajectory rule
- 补 runtime / view contract
- 补 active docs / release note

### Success condition

失败不再只停留在聊天、记忆或临时备注里，
而能进入下一轮改进输入。

---

## Variance policy

real agent eval 天然存在方差。
当前阶段不以统计显著性为目标，而以可解释性优先。

### Default rule

- 每个 scenario 先支持单次真实运行
- 如果结果异常或不稳定，再追加重复运行
- `suspicious` 优先进入 review，不急于用固定通过率阈值掩盖问题

### Suspicious triggers

以下情况应至少标记为 `suspicious`：

- outcome 偶尔通过、偶尔失败
- 不同 run 间 trajectory 差异明显
- 失败原因暂时无法区分是模型波动、工具环境波动还是 runtime bug
- operator-facing clarity 明显波动但无法立即定责

### Flaky handling order

对 flaky case 的处理顺序固定为：

1. 先检查 tool target / sandbox 环境是否不稳定
2. 再检查模型采样参数是否过于发散
3. 再检查 runtime control path 是否存在非确定性 bug
4. 最后才考虑是否调整 grader

### Severity override rule

即使某次结果看起来通过，
只要出现以下任一问题，也应至少标记为 `suspicious`，必要时直接 `fail`：

- 绕过 graph-backed path
- 丢失必要 approval
- recovery 后重复不可重复 side effect
- artifact package ownership 错误
- hydration / replay 后可见状态明显漂移

也就是说：

**高严重度控制流问题优先级高于表面成功结果。**

---

## Exit criteria

完成这份最小真实评估清单，至少意味着：

- 4 个核心 scenario 已固定
- 每个 scenario 都有真实任务外壳
- 每个 scenario 都有 outcome check
- 每个 scenario 都有 trajectory rule
- trace 足以支持回放与归因
- regression 基础设施可以承载这些评估
- review queue 可以沉淀高价值失败样本
- real lane 与 foundation eval lane 已明确分层
- variance handling 规则已固定

---

## Non-goals reminder

当前阶段不追求：

- 大而全评估体系
- 产品化评估 UI
- 通用 agent benchmark
- 单一总分
- 高覆盖率先于高相关性

当前只追求：

**用最小 real agent eval 验证当前主链是否成立。**

---

## Short version

现在只做 4 件事：

- 固定 4 个真实工作流场景
- 每个场景补 1 个 outcome check
- 每个场景补 1 个 trajectory rule
- 用最小 trace + review queue 接住失败

并且明确：

- 这是 real agent eval lane
- 不是 foundation eval lane
- 不是默认快速 gate
- 复用基础设施，但保持独立入口

先证明主链成立，
再扩评估体系。

## Exit criteria

完成这份最小真实评估清单，至少意味着：

- 4 个核心 scenario 已固定
- 每个 scenario 都有 outcome check
- 每个 scenario 都有 trajectory rule
- trace 足以支持回放与归因
- regression 流可以承载这些评估
- review queue 可以沉淀高价值失败样本

---

## Non-goals reminder

当前阶段不追求：

- 大而全评估体系
- 产品化评估 UI
- 通用 agent benchmark
- 单一总分
- 高覆盖率先于高相关性

当前只追求：

**用最小真实评估验证当前主链是否成立。**

---

## Short version

现在只做 4 件事：

- 固定 4 个真实场景
- 每个场景补 1 个 outcome check
- 每个场景补 1 个 trajectory rule
- 用最小 trace + review queue 接住失败

先证明主链成立，  
再扩评估体系。
