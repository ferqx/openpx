# OpenPX 2026 Q2 Execution Plan: Capability, Eval, and Operator UI

Date: 2026-04-09
Status: Working
Related docs:
- `ROADMAP.md`
- `docs/active/future-roadmap-capability-eval-ui-platform.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## Purpose

这份文档把未来一个季度的工作，
从长期方向拆成可执行阶段。

目标不是“覆盖全部未来”，
而是在一个季度内完成三件事：

1. 让 Agent OS 内核闭环
2. 让评估/观测开始工作
3. 让 UI 进入 operator shell 形态

---

## Quarter objective

到本季度结束时，OpenPX 应达到以下状态：

- approval / reject / resume / artifact / commit 走统一执行路径
- runtime snapshot + events 成为 shell 的唯一真相源
- outcome eval 与 trajectory eval 起盘
- TUI 开始具备 operator shell 的最小能力
- recovery / reconnect / replay 有基础稳定性保障

---

## Planning rules

本季度遵守以下规则：

- 不插入新的重产品 UI 主线
- 不让 Web / IDE / Desktop 反向驱动协议
- 不接受 graph path 与 shortcut path 长期并存
- 不新增由 TUI 持有的业务真相
- 每个 work package 必须有明确 touched files、tests、exit criteria

---

## Phase 1 — Execution loop closure

### Timebox
Week 1–3

### Goal
补齐 graph-backed execution loop，消除关键 shortcut path。

### Work packages

#### WP1. Active work package context
目标：
- executor / verifier 统一消费 active work package
- 不再直接依赖 raw request 或隐式上下文

交付物：
- active work package 在 runtime 中稳定可取
- verifier 与 executor 的上下文来源一致

验收：
- 相同任务在 approve / reject / resume 后使用一致上下文
- 没有旧 package 状态泄漏

#### WP2. Current package artifact flow
目标：
- artifact 严格绑定 current package
- 避免跨 package 读取/写入与错误展示

交付物：
- package-scoped artifact generation
- package-scoped artifact verification
- package-scoped answer linkage

验收：
- artifact 不再关联错误 package
- answer / artifact / commit 状态一致

#### WP3. Approval resume artifact execution
目标：
- approval 后恢复执行回到统一 graph path
- artifact 继续生成与验证遵循统一模型

交付物：
- approval resolution command -> graph resume
- artifact path 不经控制面 shortcut

验收：
- approve 后不会进入平行执行分支
- 相关集成测试通过

#### WP4. Rejection resume graph flow
目标：
- reject 后通过统一 graph 模型 replan / continue
- 不以直接终止替代真正恢复语义

交付物：
- rejection reason 进入稳定恢复语义
- resume/replan path 可追踪

验收：
- reject 后状态可解释
- reject 后轨迹可被 eval 捕获

### Dependencies
- runtime command model
- worker/task linkage
- package state ownership

### Exit criteria
- approve / reject / resume 统一进入 graph-backed path
- artifact flow 完全 package-scoped
- phase commit 清理 transient package state
- 关键回归测试通过

### Main risks
- 旧 shortcut path 隐性残留
- package state ownership 仍然模糊
- approval/reject 流程在 runtime 与 interface 间语义不一致

---

## Phase 2 — Runtime truth tightening

### Timebox
Week 3–6

### Goal
让 shell 真正只消费 runtime truth，继续削薄 TUI。

### Work packages

#### WP5. Runtime snapshot alignment
目标：
- 对齐 runtime snapshot、runtime session、hydration semantics

交付物：
- snapshot 足够支持完整 shell hydration
- snapshot 对 stable objects 的定义固定

验收：
- shell hydration 不需要本地补推导
- runtime snapshot 能支撑冷启动恢复

#### WP6. Worker lifecycle stabilization
目标：
- worker 成为明确可观察对象
- `spawn / resume / cancel / join / inspect` 语义收口

交付物：
- WorkerView 稳定
- worker lifecycle events 稳定
- ownerWorkerId 语义清晰

验收：
- task / worker 绑定关系清楚
- operator UI 可直接消费 worker truth

#### WP7. Thin TUI pass
目标：
- 进一步移除 TUI 本地业务拼装
- TUI 只消费 stable views 与 presentational state

交付物：
- approval semantics 从聊天式输入迁出
- 本地 utility/conversation 推导逻辑继续外移
- interface 层职责重新收口

验收：
- 不再由 TUI 发明 canonical approval truth
- 不再由 TUI 发明 canonical answer truth
- TUI 主要持有 presentational state

### Dependencies
- stable protocol objects
- runtime view projector
- kernel / runtime boundary clarification

### Exit criteria
- TUI 只依赖 stable view objects
- runtime-session 成为唯一语义转换点
- replay 与 hydration 得到同一可见状态

### Main risks
- TUI 仍然偷偷保留业务判断
- stable view 设计不完整，导致 UI 被迫本地补逻辑
- worker truth 暴露得过粗或过细

---

## Phase 3 — Eval and observability foundation

### Timebox
Week 5–8

### Goal
建立最小但完整的 eval/observability 飞轮。

### Work packages

#### WP8. Trace store
目标：
- 存结构化执行轨迹
- 不把 UI 噪声当 trace

交付物：
- trace schema
- trace persistence format
- trace query helpers

验收：
- 可以从一次运行中还原关键控制流
- 可按 thread/run/task/worker 查询

#### WP9. Scenario suite
目标：
- 建立固定回放场景用于回归和对比

建议首批场景：
- 基础任务成功路径
- approval required 路径
- rejection + replan 路径
- interrupt + resume 路径
- artifact generation + verification 路径

验收：
- 每次核心改动可重跑同一批场景
- 场景能稳定复现关键状态迁移

#### WP10. Outcome eval
目标：
- 自动判断“有没有做成”

指标建议：
- task completion
- artifact ownership correctness
- answer-goal alignment
- approval resume success
- rejection replan success

验收：
- outcome eval 可在 scenario suite 上自动运行
- 至少覆盖核心主路径

#### WP11. Trajectory eval
目标：
- 自动判断“过程是否健康”

规则建议：
- graph path correctness
- unnecessary approval detection
- missing approval detection
- invalid state transition detection
- duplicate side-effect detection

验收：
- 能识别至少一批明显控制流错误
- 能输出与 runtime object 对齐的问题定位

#### WP12. Review queue
目标：
- 把失败与边缘案例沉淀成可复盘对象

交付物：
- review item format
- failure bucketing
- simple reviewer workflow

验收：
- 人工复盘有统一入口
- 能选出高价值失败样本

### Dependencies
- stable runtime events
- stable snapshot semantics
- scenario replay capability

### Exit criteria
- 核心任务具备 scenario suite
- outcome eval 与 trajectory eval 可运行
- review queue 开始积累有效样本

### Main risks
- trace 数据过噪
- eval 指标定义过早绑定 UI 表现
- replay 场景与真实运行偏差过大

---

## Phase 4 — Minimum operator UI

### Timebox
Week 7–10

### Goal
把 TUI 推进到最小 operator shell 形态。

### Work packages

#### WP13. Execution panel
展示：
- current thread
- active run
- active task
- owner worker
- phase

验收：
- 用户不看完整 transcript 也知道现在在干什么

#### WP14. Approval panel
展示：
- pending approval
- risk type
- scope of effect
- available actions
- next-step expectation

验收：
- 用户能理解为什么现在要批
- 用户能理解批了之后会发生什么

#### WP15. Recovery panel
展示：
- blocked reason
- resume options
- latest failure boundary
- resumability state

验收：
- 用户能明确判断是否可恢复
- 用户能触发正确恢复动作

#### WP16. Artifact panel
展示：
- current package artifacts
- verification state
- commit state
- answer linkage

验收：
- 用户能快速审阅当前输出与提交状态

#### WP17. Stable event timeline
展示：
- 稳定对象变化
- 关键 phase change
- 不展示内部噪声事件

验收：
- 时间线能帮助排查问题
- 时间线不污染业务语义

### Dependencies
- stable views
- eval trace summaries
- clear approval/recovery semantics

### Exit criteria
- operator UI 能覆盖“看状态 / 批准 / 打断 / 恢复 / 审阅”
- UI 不再拥有竞争性真相
- 新增 UI 功能不需要回到 TUI 本地补业务模型

### Main risks
- 面板设计过早产品化
- 时间线过载
- UI 为了完整性重新引入本地业务状态

---

## Cross-cutting work

这些工作不单独作为一阶段，但应贯穿整个季度：

### A. Test discipline
- unit tests for protocol objects
- integration tests for runtime flows
- scenario tests for eval
- no-`any` discipline in touched areas

### B. Documentation hygiene
- 完成的 work package 及时回写到 active docs
- 被 supersede 的设计及时归档
- 保持只有一个 active baseline

### C. Instrumentation discipline
- 优先记录稳定对象与稳定状态迁移
- 不把 debug 噪声永久化
- trace 与 runtime model 保持同构

---

## Suggested metrics for the quarter

### Capability metrics
- approval resume success rate
- rejection replan success rate
- artifact ownership correctness
- interrupt/resume consistency
- duplicate side-effect rate

### Eval metrics
- scenario suite pass rate
- outcome eval coverage
- trajectory eval catch rate
- review queue yield

### UI metrics
- approval resolution time
- blocked-state diagnosis time
- recovery success after operator intervention
- artifact review completeness

---

## Dependency graph

### Critical chain
1. execution loop closure
2. runtime truth tightening
3. trace store + scenario suite
4. outcome/trajectory eval
5. minimum operator UI

### Rule
后面的阶段不得倒逼前面的协议重新漂移。  
如果 UI 需求与 runtime truth 冲突，应优先修 runtime view，而不是在 UI 本地打补丁。

---

## What we explicitly do not do this quarter

- 不做大规模产品 UI redesign
- 不做 Web / Desktop / VSCode 主线接入
- 不做高级 narrative/compaction 扩张
- 不做远程 daemon / cloud control plane
- 不新增绕过统一执行模型的便利 shortcut

---

## Quarter success definition

如果本季度结束时满足以下条件，则视为成功：

- approval / reject / resume / artifact / commit 统一进 graph-backed model
- shell hydration 可直接依赖 snapshot
- worker lifecycle 进入稳定可观察对象集合
- outcome eval 与 trajectory eval 起盘
- TUI 初步具备 operator shell 能力
- recovery / reconnect / replay 的关键路径有基础测试保障

---

## Short version

这个季度不追求“更大”，只追求“更准”。

先完成：
- 执行闭环
- 真相收口
- 评估起盘
- 最小操作面

然后再进入：
- hardening
- release
- product/platform