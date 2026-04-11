# OpenPX Real Eval Work Packages (Post-V0 Expansion)

Purpose: 把 Real Eval 后续扩展设计拆成可执行的工作包。

---

## Baseline status

当前 Real Eval 的 V0 实施基线是：

- `docs/work-packages/minimal-real-eval-checklist.md`

本文件不是当前 implementation baseline，
而是 V0 minimal real eval lane 之后的扩展工作包草案。

因此：

- 不应把本文件中的顺序视为当前默认排期
- 不应在 V0 未完成前直接展开 operator UI、gate、metrics 等工作
- 如与 `minimal-real-eval-checklist.md` 冲突，以 V0 baseline 为准

---

## WP0. 设计收口与边界对齐

### 目标
把 Real Eval 与现有 deterministic eval、runtime objects、review queue 的关系定清楚。

### 交付物
- domain boundary note
- data ownership note
- failure taxonomy note
- docs/active 文档落盘

### 验收
- 团队对对象模型和边界没有歧义
- Real Eval 不再被视为临时脚本集

---

## WP1. Domain Objects 与 Schema

### 目标
定义 Real Eval 的第一类对象。

### 交付物
- RealEvalSuite
- RealEvalScenario
- RealEvalSample
- RealEvalAttempt
- RealEvalCheckpoint
- RealEvalIntervention
- RealEvalScore
- RealEvalBudget
- schema validators

### 验收
- 对象可序列化
- 状态机合法性可校验

---

## WP2. SQLite Store 与 Migration

### 目标
建立持久化地基。

### 交付物
- sqlite migrations
- sqlite-real-eval-store
- query helpers
- basic indexes

### 验收
- suite/sample/attempt/checkpoint/intervention/score 可落库
- 支持按 suite/sample 检索

---

## WP3. Scenario Registry 与 Sample Expander

### 目标
把场景从文档转成系统可执行对象。

### 交付物
- v0 scenario registry
- scenario versioning
- sample expander
- workspace template binding
- grader binding

### 验收
- 可从 scenario 自动展开 samples
- 支持固定 seed / sample count

---

## WP4. Single Sample Executor

### 目标
跑通单个真实样本。

### 交付物
- prepareSample
- attachRuntime
- runSampleMainLoop
- finalizeSample
- runtime refs collector
- event collector
- artifact / side-effect collector

### 验收
- 单个 sample 能从 created 跑到 completed / failed / uncertain
- 完成即落库

---

## WP5. Suite Runner 与 Orchestrator

### 目标
支持整轮 suite 运行。

### 交付物
- suite runner
- queue builder
- scheduling loop
- suite summary
- JSON output

### 验收
- 可执行 v0 suite
- suite 能输出 sample summaries

---

## WP6. Budget / Cost / Latency Tracking

### 目标
把成本变成第一类可见对象。

### 交付物
- suite budget enforcement
- sample budget enforcement
- token usage tracking
- cost tracking
- wall clock tracking
- partial stop summary

### 验收
- 达到 budget 阈值时系统安全停轮
- token/cost 可回查

---

## WP7. Checkpoint 与 Resume

### 目标
支持长时运行恢复，而不是整轮重跑。

### 交付物
- checkpoint writer
- checkpoint types
- resume manager
- restore rules
- uncertain detection rules

### 验收
- suite 中断后可从未完成 sample 继续
- destructive 边界不清晰时标记 uncertain，而不是自动重跑

---

## WP8. Stuck Monitor 与 Failure Routing

### 目标
处理卡死、断连、provider 抖动。

### 交付物
- heartbeat monitor
- no-event timeout
- no-progress timeout
- failure classifier
- retry policy

### 验收
- stuck sample 能被正确转入 infra failure / waiting_human / uncertain

---

## WP9. Manual Intervention Commands

### 目标
先提供命令级人工接管能力。

### 交付物
- pause suite
- resume suite
- pause sample
- resume sample
- retry from checkpoint
- mark uncertain
- skip sample
- close as infra/product failure
- assign score

### 验收
- intervention 落库
- intervention 后 sample 状态合法

---

## WP10. v0 Scenarios 落地

### 目标
把首批真实场景跑起来。

### 场景
- repo-plan
- safe-edit
- approval-required
- reject-replan
- approve-complete
- restart-recovery

### 验收
- 6 个场景均可运行
- 支持 sample count 和固定 seed

---

## WP11. Graders 与 Review Queue Integration

### 目标
形成结构化判定与失败沉淀。

### 交付物
- outcome graders
- trajectory graders
- trust scoring hooks
- review queue writer
- failure categorization

### 验收
- sample 可产生 structured result
- 高价值失败可自动入 review queue

---

## WP12. Operator UI v1

### 目标
提供最小可运营界面。

### 页面
- Suite Overview
- Sample Detail
- Intervention Panel
- Scoring / Review Panel

### 验收
- operator 能看进度、看详情、人工介入、人工评分

---

## WP13. Gate Integration

### 目标
把 Real Eval 接入开发与预发布门槛。

### 交付物
- dev gate policy
- pre-release gate policy
- canary gate policy
- release summary exporter

### 验收
- 可对 release candidate 产生 pass/fail / blocked 结论

---

## WP14. Metrics 与趋势报告

### 目标
让系统可运营、可持续复盘。

### 交付物
- quality metrics
- cost metrics
- recovery metrics
- trust metrics
- eval-system-health metrics
- trend report

### 验收
- 能看到 completion / approval / recovery / cost / intervention 趋势

---

## 建议实施顺序（V0 之后）

1. WP0
2. WP1
3. WP2
4. WP3
5. WP4
6. WP5
7. WP6
8. WP7
9. WP8
10. WP9
11. WP10
12. WP11
13. WP12
14. WP13
15. WP14
