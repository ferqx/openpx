# OpenPX 2026 Q2 Eval Execution Plan

Date: 2026-04-09
Status: Working
Related docs:
- `docs/active/eval-system-framework.md`
- `docs/active/system-execution-framework.md`
- `docs/active/versioning-release-governance.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## 1. Purpose

这份文档把 OpenPX 的长期评估框架，
拆成一个季度内可落地的执行计划。

目标不是在一个季度里做完“完整评估平台”，
而是建立最小但有效的 eval flywheel：

- 有 scenario
- 有 outcome checks
- 有 trajectory rules
- 有 trace
- 有 review queue
- 能进入 release gate

---

## 2. Quarter objective

到本季度结束时，OpenPX 应具备以下评估能力：

- 核心主路径拥有 scenario suite
- outcome eval 能自动运行
- trajectory eval 能抓住主要控制流错误
- trace 可以支撑回放和问题定位
- review queue 能开始沉淀失败样本
- release candidate 至少受一部分 eval gate 约束

---

## 3. Planning rules

本季度遵守以下规则：

- 不做大而全的评估平台
- 不把 UI dashboard 当作评估层本体
- 不接受“先做能力、以后补 eval”
- 不接受没有 scenario 的核心能力改动
- 不接受 release 完全脱离 scenario/eval

---

## 4. Phase 1 — Scenario baseline

### Timebox
Week 1–2

### Goal
建立核心场景族，让主要能力有固定验证输入。

### Work packages

#### WP1. Scenario taxonomy
交付物：
- happy path
- approval-required path
- reject-and-replan path
- interrupt-and-resume path
- artifact path
- recovery path
- control-boundary path

验收：
- 后续能力改动可以明确落到某个场景族

#### WP2. Scenario template
模板字段：
- goal
- initial setup
- required control semantics
- expected transitions
- expected outputs
- acceptable variants

验收：
- 所有新增 scenario 采用统一结构

#### WP3. First core scenarios
至少落地一组核心场景：
- 基础任务成功
- approval 后继续
- rejection 后 replan
- artifact 生成与验证
- interrupt 后恢复

验收：
- 这些场景可稳定复用

### Dependencies
- current runtime truth model
- active capability work packages

### Main risks
- 场景定义过于抽象，无法真正执行
- 场景与 runtime object 脱节

---

## 5. Phase 2 — Trace foundation

### Timebox
Week 2–4

### Goal
建立最小 trace 基础，让运行过程可回放、可归因、可比较。

### Work packages

#### WP4. Trace schema
交付物：
- run identity
- thread/task/worker linkage
- critical transitions
- approval/reject/resume milestones
- artifact milestones
- answer milestones
- side-effect records

验收：
- trace 足以定位核心路径问题
- trace 不依赖 UI transcript

#### WP5. Trace persistence
交付物：
- trace storage format
- retrieval helpers
- basic filtering by run/thread/task/worker

验收：
- 可按关键对象查询一次运行

#### WP6. Trace hygiene
交付物：
- trace field discipline
- UI-only transient state exclusion
- debug noise exclusion rules

验收：
- trace 可读、可比较、不过噪

### Dependencies
- stable runtime events
- snapshot checkpoints（如适用）

### Main risks
- trace 过度日志化
- trace 和 runtime object model 不同构

---

## 6. Phase 3 — Outcome eval baseline

### Timebox
Week 4–6

### Goal
建立最小自动结果判定能力。

### Work packages

#### WP7. Outcome grader baseline
首批 outcome grader 建议覆盖：
- task completion
- artifact ownership correctness
- approval resume success
- rejection replan success
- expected output presence

验收：
- 核心主路径至少可自动判定“有没有做成”

#### WP8. Scenario binding
交付物：
- 每个核心 scenario 绑定至少一个 outcome check

验收：
- scenario 不再只是文档，而是可判断结果的测试单元

#### WP9. Failure categorization
交付物：
- outcome fail categories
- common failure reasons
- mapping to runtime object

验收：
- fail 不再只有“没过”，而有清晰分类

### Dependencies
- scenario baseline
- trace foundation

### Main risks
- outcome 判定过宽，难以支持迭代
- 结果判定依赖人工主观解释过多

---

## 7. Phase 4 — Trajectory eval baseline

### Timebox
Week 5–8

### Goal
建立最小过程健康检查能力。

### Work packages

#### WP10. Graph path conformance rules
检测：
- 是否走统一 graph-backed path
- 是否绕过了权威执行链

验收：
- shortcut path 残留可被发现

#### WP11. Approval control rules
检测：
- unnecessary approval
- missing approval
- invalid approval state transition

验收：
- 审批边界问题可自动暴露

#### WP12. Recovery rules
检测：
- invalid resume path
- repeated side effects after recovery
- hydration/replay visible-state mismatch

验收：
- 恢复类错误不再只靠人工看日志

#### WP13. Package/artifact rules
检测：
- artifact package mismatch
- answer/artifact linkage mismatch
- invalid commit-state transition

验收：
- package-scoped truth 可被自动检查

### Dependencies
- trace foundation
- stable runtime events
- scenario replay capability

### Main risks
- 过程规则定义过粗，抓不到问题
- 过程规则过于绑死当前实现细节

---

## 8. Phase 5 — Review queue and release binding

### Timebox
Week 7–10

### Goal
让失败样本进入统一复盘入口，并开始与 release 绑定。

### Work packages

#### WP14. Review queue format
字段建议：
- run id
- scenario id
- failure class
- impacted object
- severity
- suggested next action

验收：
- 人工复盘有统一入口

#### WP15. Queue ingestion rules
默认进入 review queue 的样本：
- outcome fail
- suspicious trajectory
- duplicate side-effect case
- missing approval case
- recovery mismatch
- operator confusion candidate

验收：
- 高价值失败不会散落在聊天和临时笔记里

#### WP16. Release gate binding
交付物：
- release candidate 至少运行核心 scenario suite
- release candidate 至少通过 outcome baseline
- release candidate 至少检查核心 trajectory rules

验收：
- eval 正式进入 release 语义

### Dependencies
- outcome baseline
- trajectory baseline
- versioning/release governance

### Main risks
- review queue 成为另一个没人维护的列表
- release gate 只做形式绑定

---

## 9. Cross-cutting rules

### Rule 1
任何核心能力变更，都必须带一个 scenario 或更新现有 scenario。

### Rule 2
任何行为语义变化，都必须检查是否需要更新 grader 或 trajectory rule。

### Rule 3
任何 trace 扩展，都必须解释它服务哪类 eval。

### Rule 4
任何 review item 都应尽量转化为：
- scenario
- grader
- doc update
- release note
中的至少一项。

### Rule 5
评估层的真相来自 runtime objects，不来自 UI 表象。

---

## 10. Suggested quarter metrics

### Scenario metrics
- 核心能力的 scenario coverage
- scenario replay stability

### Outcome metrics
- outcome eval coverage
- task completion detection accuracy
- artifact ownership detection accuracy

### Trajectory metrics
- graph-path rule coverage
- approval rule catch rate
- recovery mismatch catch rate
- duplicate side-effect detection rate

### Review metrics
- review queue yield
- review-to-scenario conversion rate
- review-to-grader conversion rate

### Release metrics
- release candidate eval pass rate
- releases with docs+eval sync complete

---

## 11. Quarter success definition

如果本季度结束时满足以下条件，则视为成功：

- 核心主路径有固定 scenario suite
- outcome eval 已起盘并能自动运行
- trajectory eval 能抓住主要控制流错误
- trace 支撑回放与定位
- review queue 开始稳定产出高价值样本
- release candidate 至少部分受 eval gate 约束

---

## 12. Short version

这个季度在 eval 上不追求“大平台”，
只追求形成飞轮：

- 先固定 scenario
- 再建立 trace
- 再做 outcome checks
- 再做 trajectory rules
- 最后把失败沉淀进 review queue 和 release gate