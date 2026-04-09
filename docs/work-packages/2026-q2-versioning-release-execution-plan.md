# OpenPX 2026 Q2 Versioning and Release Execution Plan

Date: 2026-04-09
Status: Working
Related docs:
- `docs/active/versioning-release-governance.md`
- `docs/active/system-execution-framework.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## Purpose

这份文档把版本治理与发布机制，
从长期规则拆成一个季度内可落地的执行计划。

目标不是“做一套很大的 release 系统”，
而是在一个季度内建立最低可用但足够严格的版本治理闭环。

---

## Quarter objective

到本季度结束时，OpenPX 应具备以下能力：

- protocol changes 有明确评估流程
- behavior changes 不再静默进入主干
- release candidate 有固定 gate
- active docs 与代码行为保持同步
- scenario/eval 成为 release gate 的一部分
- runtime daemon / reconnect / compatibility 风险被正式纳入计划

---

## Planning rules

本季度遵守以下规则：

- 不为了发版便利跳过 protocol review
- 不允许 breaking change 没有 migration note
- 不允许功能合并后再补 active docs
- 不允许 UI 兼容逻辑替代协议兼容逻辑
- 不允许用手工 smoke 代替 scenario/eval gate

---

## Phase 1 — Establish release taxonomy and gates

### Timebox
Week 1–2

### Goal
建立统一 release class 与 release gate。

### Work packages

#### WP1. Release class definition
交付物：
- patch / minor / major 定义固定
- protocol / behavior / doc impact checklist

验收：
- 所有后续 PR / work package 可以明确落入某一 release class

#### WP2. Gate definition
交付物：
- protocol/schema gate
- runtime flow gate
- scenario/eval gate
- operator shell gate
- docs gate

验收：
- release candidate checklist 固定
- 团队对“什么算 ready”有统一答案

### Dependencies
- current protocol schema layout
- active docs hierarchy

### Main risks
- 把 behavior drift 误当成非发布问题
- gate 定义过大，导致没人执行

---

## Phase 2 — Protocol governance baseline

### Timebox
Week 2–4

### Goal
让 protocol change 成为一个显式流程，而不是口头共识。

### Work packages

#### WP3. Protocol impact template
交付物：
- 每个 protocol-related 变更都必须填写 impact section
- 标明 command / event / snapshot / view contract 影响面

验收：
- 任何协议变更都可快速判断是否 breaking

#### WP4. Compatibility test baseline
交付物：
- protocol schema regression checks
- snapshot shape regression checks
- event/command compatibility checks

验收：
- 改 protocol 时有自动化反馈
- 旧行为是否仍兼容可被检测

#### WP5. Deprecation flow
交付物：
- deprecated 标记格式
- deprecated -> removal 的流程说明
- release note 标准写法

验收：
- 不再出现“直接删字段但没有迁移说明”

### Dependencies
- stable protocol modules
- api compliance tests

### Main risks
- 协议还在漂移，导致模板先天不稳
- deprecated 流程写了但没人执行

---

## Phase 3 — Behavior governance baseline

### Timebox
Week 4–6

### Goal
把行为变化纳入正式发布语义。

### Work packages

#### WP6. Behavior change checklist
覆盖：
- approval semantics
- reject/resume semantics
- recovery semantics
- artifact ownership semantics
- operator interaction semantics

验收：
- 每次行为改变都能被标记
- 行为变化不再藏在代码 diff 里

#### WP7. Scenario binding
交付物：
- behavior change 必须绑定 scenario suite 更新
- outcome / trajectory eval 绑定变更说明

验收：
- “行为变了”一定会推动 scenario/eval 更新

#### WP8. Migration note template
交付物：
- 行为迁移说明模板
- breaking / non-breaking 行为变化写法

验收：
- major/minor 行为变化都能被一致记录

### Dependencies
- scenario suite baseline
- outcome/trajectory eval baseline

### Main risks
- 只关注 schema，不关注 operator 可见行为
- scenario 没有覆盖真实关键路径

---

## Phase 4 — Documentation sync as release gate

### Timebox
Week 5–7

### Goal
让文档同步从“良好习惯”变成“发布门槛”。

### Work packages

#### WP9. Docs-to-update enforcement
交付物：
- PR / work package 模板中的 docs-to-update 必填
- active doc impact review

验收：
- 任何关键变更都知道要更新哪份 doc

#### WP10. Active/historical cleanup loop
交付物：
- 被 supersede 的文档及时归档
- active baseline 唯一化

验收：
- release 后不会留下两份并行路线

#### WP11. Release note structure
交付物：
- breaking changes
- behavior changes
- protocol changes
- doc changes
- scenario/eval changes

验收：
- release note 能真实反映系统变化，而不是流水账

### Dependencies
- docs hierarchy already established
- roadmap / active docs ownership clear

### Main risks
- 文档更新只做形式同步
- release note 不足以支持未来回溯

---

## Phase 5 — Hardening-facing release readiness

### Timebox
Week 7–10

### Goal
把还处于“测试提示/计划提示”的稳定性议题，纳入正式 release 视角。

### Work packages

#### WP12. Reconnect / daemon reuse release criteria
背景：
- 当前测试中已经存在关于“重连客户端复用同一个 device runtime daemon across workspaces”的 placeholder

交付物：
- daemon reuse 的语义定义
- reconnect 的兼容性边界
- cross-workspace reuse 的非目标与约束

验收：
- 该能力不再只是测试注释
- 是否进入当前 release 被清晰定义

#### WP13. Recovery compatibility criteria
交付物：
- hydrate / replay / restart recovery 的兼容性边界
- idempotent recovery 验收条件

验收：
- recovery 不再只被视为内部实现细节
- release 可以说明恢复能力的稳定程度

### Dependencies
- runtime hardening plan
- scenario/eval support

### Main risks
- 过早承诺超出当前实现成熟度的兼容性
- 只写标准，不落测试

---

## Cross-cutting rules

### Rule 1
谁改行为，谁写行为说明。

### Rule 2
谁改协议，谁补兼容测试。

### Rule 3
谁改 active behavior，谁更新 active docs。

### Rule 4
没有 scenario/eval 更新的核心行为变更，不应直接进入 release。

### Rule 5
compatibility 决策必须可回溯，不能只存在口头讨论中。

---

## Suggested quarter metrics

### Governance metrics
- 进入主干的 protocol changes 中，有 impact record 的比例
- 进入主干的 behavior changes 中，有 migration/release note 的比例
- release candidate checklist 完整率
- docs sync completeness

### Quality metrics
- schema regression pass rate
- scenario suite pass rate
- eval pass rate on release candidates
- reconnect/recovery readiness coverage

---

## Quarter success definition

如果本季度结束时满足以下条件，则视为成功：

- release class 与 gates 固定下来
- protocol change 有统一评估模板
- behavior change 有统一记录模板
- docs sync 成为 release gate
- reconnect / recovery 进入正式 release 视角
- 以后做 runtime、TUI、eval、workflow 改动时，都能沿同一治理流程推进

---

## Short version

这个季度在版本治理上的目标不是“发很多版”，
而是先把“什么叫能发”定义清楚。

先固定：
- 版本线
- gate
- 兼容规则
- 文档同步
- scenario/eval 绑定

然后再谈更成熟的发布节奏。