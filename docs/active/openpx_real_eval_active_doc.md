# OpenPX Real Eval 系统设计（Future Expansion）

Status: Future Expansion
Audience: Core runtime / eval / operator UI owners
Purpose: 作为 OpenPX Real Eval 的后续扩展设计文档，不是当前实施基线。

---

## Baseline status

当前 Real Eval 的 V0 实施基线是：

- `docs/work-packages/minimal-real-eval-checklist.md`

本文件不是当前 active implementation baseline。
它描述的是 V0 之后可能演进出的更完整 Real Eval 系统方向，
包括 operator UI、gate integration、长期对象模型与运营能力。

在 V0 minimal real eval lane 完成前，
不得把本文件中的长期能力当作当前默认排期或必做范围。

---

## 1. 目标

OpenPX Real Eval 不是一组临时评估脚本，而是一套可长期演进的真实任务评估运行时。

长期系统目标：

- 跑真实模型、真实仓库、真实任务、真实副作用
- 控制 token、成本、时长预算
- 支持 checkpoint、恢复、续跑
- 区分 infra failure、model failure、product failure
- 支持人工介入、人工打分、人工关闭
- 提供 operator 风格的 eval UI
- 在后续阶段评估是否进入 release / canary / production gate

---

## 2. 设计约束

### 2.1 建立在现有 deterministic eval 之上

Real Eval 不替代现有：

- `eval:core`
- `eval:suite`
- `eval:review`
- scenario runner
- baseline compare
- review queue

Real Eval 的定位是：在现有 deterministic control regression eval 之上，增加一层真实任务评估运行时。

### 2.2 UI 不发明真相

UI 只能消费：

- runtime objects
- eval store
- checkpoints
- interventions
- scores

UI 不能自行重建 authoritative state。

### 2.3 local-first 起盘

首选：

- SQLite
- 单机 runner
- 受控并发
- operator-first UI

---

## 3. 总体架构

系统分七层：

1. Scenario Layer：定义“评什么”
2. Orchestration Layer：定义“怎么排、怎么跑”
3. Execution Layer：定义“单个 sample 怎么执行”
4. Persistence Layer：定义“怎么落库、怎么恢复”
5. Analysis Layer：定义“怎么判、怎么总结”
6. Operator Layer：定义“人怎么看、怎么接管”
7. Gate Layer：定义“如何进入 release / canary / production gate”

---

## 4. 核心对象模型

### 4.1 RealEvalSuite

表示一次 suite 运行。

核心字段：

- suiteRunId
- suiteId
- suiteVersion
- status
- budgetPolicy
- concurrencyPolicy
- createdAt / startedAt / completedAt
- summary

### 4.2 RealEvalScenario

表示一个真实场景定义。

核心字段：

- scenarioId
- scenarioVersion
- family
- riskLevel
- workspaceTemplate
- inputTemplate
- graderConfig
- expectedControlSemantics
- expectedOutcome

### 4.3 RealEvalSample

表示一个具体样本。

核心字段：

- sampleId
- suiteRunId
- scenarioId
- sampleIndex
- status
- workspaceRoot
- modelConfig
- budgetSnapshot
- failureClass
- humanReviewState

### 4.4 RealEvalAttempt

表示 sample 的一次执行尝试。

核心字段：

- attemptId
- sampleId
- attemptNumber
- startedAt / endedAt
- startReason / endReason
- status

### 4.5 RealEvalCheckpoint

表示恢复点。

核心字段：

- checkpointId
- sampleId
- attemptId
- checkpointType
- threadId / runId / taskId
- approvalIds
- sideEffectSummary
- tokenUsageSnapshot
- costSnapshot

### 4.6 RealEvalIntervention

表示人工介入。

核心字段：

- interventionId
- sampleId
- attemptId
- operatorAction
- reason
- note
- beforeState / afterState

### 4.7 RealEvalScore

表示人工评分。

核心字段：

- scoreId
- sampleId
- outcomeScore
- trajectoryScore
- trustScore
- approvalClarityScore
- blockedReasonScore
- artifactReviewabilityScore
- note

---

## 5. 状态机

### 5.1 Suite

- created
- running
- paused
- stopping
- completed
- failed

### 5.2 Sample

- created
- queued
- running
- waiting_human
- paused
- uncertain
- completed
- failed
- skipped

### 5.3 Attempt

- started
- checkpointed
- resumed
- ended_completed
- ended_failed
- ended_uncertain
- ended_aborted

关键规则：

- `uncertain` 不能自动重跑
- `waiting_human` 需要 operator decision
- `completed` 的 sample 不得重复执行

---

## 6. 失败分类

### 6.1 Infra Failure

例如：

- provider timeout
- 模型接口 5xx
- runtime daemon 失联
- 网络波动
- 本地 IO 暂时失败

### 6.2 Model Failure

例如：

- 任务理解错误
- 计划不可执行
- 无效 replan
- 明显质量不足

### 6.3 Product Failure

例如：

- missing approval
- reject 后偷跑
- 恢复后挂错 thread/run
- destructive side effect 重复执行
- blocked reason 不可理解

### 6.4 Uncertain State

例如：

- destructive 边界不清晰
- event 不完整
- 恢复边界不可确认

`uncertain` 不是普通 failed，不能默认自动重试。

---

## 7. 执行与调度

### 7.1 Runner 组成

- suite runner
- scenario expander
- sample executor
- stuck monitor
- resume manager

### 7.2 调度原则

并发单位是 sample。

默认策略：

- planning / read-only：2~4
- low-risk edit：2
- approval / high-risk：1
- recovery / restart：1

约束：

- 同一 workspace 同时只允许 1 个 active sample
- uncertain sample 不自动重新入队
- destructive family 默认串行

### 7.3 恢复规则

#### 可自动恢复

- sample 未开始
- read-only planning 中断
- runtime attach 前中断

#### 需人工恢复

- destructive 边界不清晰
- approval 相关状态不完整
- runtime objects 与 side-effect ledger 不一致

---

## 8. 存储设计

首选 SQLite。

建议表：

- real_eval_suites
- real_eval_samples
- real_eval_attempts
- real_eval_checkpoints
- real_eval_interventions
- real_eval_scores
- real_eval_costs
- real_eval_runtime_refs
- real_eval_artifact_refs

持久化原则：

1. sample 完成即落库
2. checkpoint 边界到达即落库
3. intervention 实时落库

---

## 9. 预算与成本控制

### 9.1 Suite 级预算

- max_total_tokens
- max_total_cost
- max_wall_clock_minutes
- max_failed_samples
- max_uncertain_samples

### 9.2 Sample 级预算

- max_prompt_tokens
- max_completion_tokens
- max_runtime_minutes
- max_model_calls
- max_retries

### 9.3 Budget Stop

达到任一预算阈值时：

- 停止新 sample 入队
- 允许 running sample 安全结束或转人工
- 输出 partial summary

---

## 10. 人工干预

第一阶段先支持命令级动作：

- pause suite
- resume suite
- pause sample
- resume sample
- retry sample from checkpoint
- mark uncertain
- skip sample
- close as infra failure
- close as product failure
- assign score
- send to review queue

---

## 11. Operator UI

最小页面：

### 11.1 Suite Overview

显示：

- suite 状态
- 已完成 / 运行中 / 等待人工 / uncertain / failed 数量
- token / cost / duration
- budget 剩余
- failure breakdown

### 11.2 Sample Detail

显示：

- scenario metadata
- sample 输入
- model config
- workspace
- thread/run/task linkage
- approvals
- artifacts
- side effects
- checkpoints
- grader outputs
- human notes

### 11.3 Intervention Panel

支持：

- pause
- resume
- retry
- skip
- mark uncertain
- close as infra failure
- close as product failure
- send to review
- assign reviewer

### 11.4 Scoring / Review Panel

支持：

- outcome / trust / clarity 打分
- review note
- follow-up 类型
- closure state

---

## 12. 指标

### 12.1 任务质量

- completion rate
- approval correctness
- replan success rate
- artifact correctness

### 12.2 过程健康

- missing approval rate
- unnecessary approval rate
- duplicate side-effect rate
- recovery correctness
- uncertain rate

### 12.3 运营指标

- avg sample runtime
- suite wall clock
- tokens per sample
- cost per scenario family
- retry rate
- checkpoint hit rate
- manual intervention rate

### 12.4 信任指标

- approval clarity
- blocked reason clarity
- artifact reviewability
- trust score

---

## 13. Gate

### 开发期 Gate

- deterministic eval 持续通过
- real eval v0 可运行
- hard fail 为 0

### 预发布 Gate

- v0/v1 suite 通过
- high-risk scenarios 全通过
- no missing approval
- no duplicate destructive side effect

### 生产前 Gate

- canary suite 达标
- recovery correctness 达标
- trust score 达标
- uncertain 未决样本为 0

---

## 14. 仓库落盘建议

```text
src/
  eval-real/
    domain/
    schema/
    scenarios/
    runner/
    graders/
    persistence/
    ui/
    cli/

tests/
  eval-real/
    domain/
    runner/
    persistence/
    recovery/
    intervention/
    grading/
```

---

## 15. 当前执行顺序

推荐顺序：

1. domain + schema + state machine
2. SQLite store
3. single sample executor
4. suite orchestrator
5. checkpoint / resume / stuck monitor
6. manual intervention commands
7. operator UI
8. gate integration

---

## 16. 成功定义

当以下条件成立时，说明 Real Eval 设计开始运转正常：

- 真实评估能跑，不只是文档存在
- 中断后不需要整轮从头开始
- destructive / recovery 类样本不会被错误自动重跑
- operator 可以介入并留下结构化记录
- token / cost / latency 有可见账本
- UI 不发明真相
- real eval 可以进入 release gate
