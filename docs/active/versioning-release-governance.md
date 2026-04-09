# OpenPX Versioning, Release, and Compatibility Governance

Date: 2026-04-09
Status: Active
Related docs:
- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/system-execution-framework.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## 1. Purpose

这份文档定义 OpenPX 的版本治理、兼容性规则、发布门槛，以及文档同步机制。

它解决的问题不是“怎么打 tag”，
而是：

- 协议变化如何管理
- 行为变化如何记录
- 文档变化如何和代码一起发布
- 什么情况下算 breaking change
- release 前必须通过哪些 gate
- 如何避免 runtime、TUI、文档各自发展出不同版本语义

---

## 2. Governance principle

OpenPX 的版本治理原则只有一句话：

**协议、行为、文档必须一起治理；任何一条线单独前进，都会制造系统漂移。**

---

## 3. Why governance is mandatory

OpenPX 不是一个纯函数库，也不是单纯的 UI 应用。  
它同时包含：

- stable runtime protocol
- runtime snapshot / event semantics
- operator shell behavior
- recovery / approval / resume semantics
- active design documentation

因此，版本治理不能只看 package version。  
它必须同时覆盖：

1. protocol compatibility
2. behavior compatibility
3. documentation alignment

---

## 4. Three version lines

OpenPX 使用三条版本线。

### 4.1 Protocol Version

用于 runtime 对外协议兼容性。

适用范围：

- runtime command schema
- runtime event schema
- runtime snapshot schema
- stable view object shape
- protocol envelope metadata

规则：

- snapshot 和 runtime event envelope 必须携带 `protocolVersion`
- client 可以显式请求协议版本
- runtime 必须拒绝不支持的协议版本
- 兼容行为应位于 protocol 之上，而不是把兼容黑魔法塞进协议层

### 4.2 Behavior Version

用于记录系统行为语义变化。

适用范围：

- approval / reject / resume semantics
- artifact ownership semantics
- recovery / hydration / replay semantics
- worker lifecycle semantics
- operator UI interaction semantics（若影响用户控制模型）

Behavior version 不一定总是独立数字暴露给用户，  
但必须进入 release notes 和 migration notes。

### 4.3 Documentation Version

用于管理“当前实现”和“当前文档”是否一致。

适用范围：

- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/*`
- 需要同步更新的 `docs/work-packages/*`

规则：

- active docs 与当前行为不一致时，不允许视为“文档稍后再补”
- doc drift 视为真实系统风险，而不是排版问题

---

## 5. Compatibility model

### 5.1 Compatible change

满足以下条件之一，通常视为兼容变更：

- 新增可选字段，且旧 client 不受影响
- 新增 runtime event 类型，但旧 client 可安全忽略
- 新增 view 字段，且不改变旧字段语义
- UI 仅做展示优化，不改变控制语义
- scenario/eval 扩展，不改变既有判定接口

### 5.2 Behavior-affecting compatible change

以下变更可能协议兼容，但行为上不应静默发布：

- approval 文案变化导致 operator 判断方式变化
- recovery flow 默认选项变化
- artifact 归属展示逻辑变化
- answer / summary 组合逻辑变化
- timeline 默认过滤逻辑变化

这类变更至少要求：

- release note 说明
- behavior note 说明
- 相关文档更新

### 5.3 Breaking change

以下情况视为 breaking change：

- 删除或重命名稳定 command / event / snapshot 字段
- 改变字段语义，使旧 client 会误解
- 改变 approval / reject / resume 的控制语义
- 改变 recovery 边界，使旧 replay / hydration 逻辑失效
- 改变 stable view contract，使 TUI / future frontend 失配
- 修改 release 后仍让 active docs 保持旧定义

breaking change 必须触发：

- protocol version 评估
- migration note
- release note
- docs sync
- scenario/eval update

---

## 6. Release unit

OpenPX 的最小 release 单元不是“改了几行代码”，
而是下面这四者的一致性：

1. runtime behavior
2. protocol contract
3. eval / regression status
4. active documentation

如果这四者没有同步完成，则不视为完整 release candidate。

---

## 7. Release classes

### 7.1 Patch release

适用于：

- bug fix
- non-semantic UI polish
- internal refactor without protocol/behavior impact
- deterministic test or docs correction

要求：

- 不改协议语义
- 不改 operator 控制语义
- release notes 简要说明即可

### 7.2 Minor release

适用于：

- 新增兼容 command / event / snapshot fields
- 新增 capability 且进入统一执行链
- 新增 eval/scenario coverage
- 新增 operator UI panel 或能力，但不破坏旧控制模型

要求：

- protocol compatibility review
- scenario/eval update
- active docs 更新
- behavior notes（如有控制语义变化）

### 7.3 Major release

适用于：

- breaking protocol change
- breaking behavior change
- approval / recovery / lifecycle 语义重写
- stable view model contract 重构
- release 后旧 client / docs 明显失效

要求：

- migration guide
- protocol version bump（若适用）
- explicit deprecation note
- broad regression suite pass
- docs sweep complete

---

## 8. Release gates

任何 release candidate 至少通过以下 gate：

### Gate 1 — Protocol/schema gate
必须通过：

- protocol schema tests
- api compliance tests
- snapshot shape tests
- command/event compatibility checks

### Gate 2 — Core runtime gate
必须通过：

- thread/run/task lifecycle tests
- approval/reject/resume tests
- artifact ownership tests
- hydration/replay tests

### Gate 3 — Scenario/eval gate
必须通过：

- scenario suite pass
- outcome eval pass
- trajectory eval pass（至少核心主路径）

### Gate 4 — Operator shell gate
若本次变更影响 TUI/operator UI，则必须通过：

- shell hydration consistency
- event replay visible-state consistency
- command correctness
- panel-level regression checks

### Gate 5 — Documentation gate
必须完成：

- `AGENTS.md` 更新（若原则变化）
- `ROADMAP.md` 更新（若优先级变化）
- 受影响 active docs 更新
- release notes / migration notes 完成

未通过任一 gate，不得视为 ready to release。

---

## 9. Change review rules

任何变更进入 merge/release 之前，必须回答：

1. 是否影响 protocol？
2. 是否影响 operator behavior？
3. 是否影响 recovery semantics？
4. 是否影响 eval/scenario baseline？
5. 是否影响 active docs？
6. 是否构成 breaking change？

若第 1–5 项中任一项为“是”，必须留下明确记录。  
若第 6 项为“是”，必须进入 breaking-change 路径。

---

## 10. Protocol change policy

### 10.1 Required actions for protocol changes

当 command / event / snapshot / view contract 变化时，必须同步：

- 更新 schema definitions
- 更新 compatibility tests
- 更新 scenario fixtures（如适用）
- 更新 operator UI bindings（如适用）
- 更新 active docs
- 记录 release notes

### 10.2 Explicit rejection rule

runtime 必须显式拒绝不支持的协议版本。  
禁止：

- 静默猜测 client 意图
- 静默降级字段
- 通过 UI heuristics 弥补协议不匹配

### 10.3 Deprecation policy

若需要弃用字段或事件：

- 先进入 deprecated 状态
- 在 active docs 标明弃用
- 给出移除计划
- 在至少一个 release 周期后再移除
- 移除时进入 breaking change 流程

---

## 11. Behavior change policy

很多问题不是 protocol break，
而是 behavior drift。

以下行为变化必须被明确记录：

- approval 触发条件变化
- reject 后恢复路径变化
- worker ownership 展示语义变化
- artifact panel 归属解释变化
- replay / hydration 可见状态变化
- blocked reason / recovery option 变化

记录方式至少包括：

- release note
- 受影响 active docs 更新
- scenario/eval 更新（若行为会影响判定）

---

## 12. Documentation sync policy

### 12.1 Active docs are release artifacts

以下文档视为 release artifact：

- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/*`

它们不是辅助材料，
而是系统定义的一部分。

### 12.2 Required doc sync cases

以下情况必须同步更新文档：

- 系统原则变化
- 协议 contract 变化
- 行为语义变化
- milestone / 优先级变化
- deprecation / supersession 变化

### 12.3 Historical migration

当文档被 supersede 时：

- 必须移入 `docs/historical/` 或明确标注 Historical
- 不允许和 active baseline 并列竞争
- release notes 应指出替代文档

---

## 13. Recommended release checklist

### Before code freeze
- 确认本次 release class（patch / minor / major）
- 列出 protocol impact
- 列出 behavior impact
- 列出 docs to update
- 列出 scenarios to rerun

### Before merge
- protocol/schema tests pass
- runtime flow tests pass
- scenario/eval pass
- docs updated
- breaking-change decision recorded

### Before tag/release note
- release note 完成
- migration note 完成（若适用）
- deprecated items 标注完成
- compatibility status 明确
- quarter plan / roadmap 是否需要更新已确认

---

## 14. Ownership

建议长期固定以下 ownership：

- protocol governance: runtime/kernel owner
- behavior governance: runtime + capability owner
- operator UI compatibility: interface owner
- eval/scenario baseline: eval owner
- docs sync: feature owner，不单独外包给“文档阶段”

原则：

**谁改行为，谁负责文档与兼容性说明。**

---

## 15. Anti-patterns

以下都是版本治理反模式：

### Anti-pattern 1
“只是改了字段名字，不算 breaking”

### Anti-pattern 2
“先兼容着，runtime 猜一猜 client 的意思”

### Anti-pattern 3
“代码先合，文档下次补”

### Anti-pattern 4
“只是 TUI 行为变了，不用写 release note”

### Anti-pattern 5
“scenario 先不补，人工测过就行”

### Anti-pattern 6
“旧文档先留着，大家自己理解哪个有效”

---

## 16. Success definition

当以下条件长期成立时，说明版本治理正常：

- protocol changes 有明确边界和拒绝策略
- behavior changes 不再静默漂移
- release notes 与 active docs 同步
- TUI / future frontends 建立在稳定 contract 上
- breaking change 不再靠口头共识处理
- 文档更新、版本更新、功能更新合并为同一个交付动作

---

## 17. Short version

OpenPX 的 release 不是“打个版本号”，
而是一次系统一致性检查。

协议、行为、文档、测试、评估，
必须一起过关。