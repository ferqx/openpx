# OpenPX 路线图

本文档只回答四件事：

1. OpenPX 当前阶段在做什么
2. 近中长期优先级顺序是什么
3. 当前明确不做什么
4. 正式发布 `v1.0` 前应按什么里程碑推进

它是方向入口，不是控制权威，也不是执行细节文档。
当它与 [CONTROL.md](./CONTROL.md) 冲突时，以 `CONTROL.md` 为准。

## 当前阶段定义

OpenPX 当前阶段不是继续铺功能，也不是优先做多前端产品化。
当前阶段是把 OpenPX 收敛成一个：

- 可恢复的本地 code agent harness（代码智能体执行底座）
- runtime（运行时）真相边界清晰的系统
- TUI 只消费 protocol（协议）与 snapshot（快照）的系统
- 可验证、可中断、可继续推进的 agent harness
- 以 run-loop 为执行内核、以 mixed recovery（混合恢复）为 `v1` 恢复语义的系统

当前代码主线已经不再以 graph 为核心执行闭环，而是以 run-loop 驱动 planner / executor / verifier / responder，并通过 suspension / continuation / run-state store 管理审批恢复与持久化恢复边界。

## `v1` 恢复语义

OpenPX `v1.0` 的正式恢复承诺锁定为混合恢复策略：

- `waiting_approval` 提供强恢复承诺
- 非审批中断只提供检测、阻塞与人工恢复承诺
- 不承诺 `plan / execute / verify / respond` 任意执行边界的自动精确续跑

这意味着：

- approval / reject / resume 是正式产品能力
- crash / uncertain execution / version mismatch 会优先进入 `human_recovery`
- 安全恢复优先于“看起来更智能”的自动续跑

## 近中长期优先级

当前固定优先级如下：

1. run-loop hardening（运行时加固）
2. system confidence（可证明性与回归信心）
3. provider & cost（模型接入层与成本控制面）
4. agent capability（coding agent 核心能力）
5. private beta（小范围真实使用）
6. release candidate / `v1.0`（发布收口）

如果前 3 项还没稳定，不应插入新的产品化主线。

## 当前主线目标

### 1. 把 OpenPX 做成稳定的 run-loop harness

重点包括：

- `thread -> run -> task -> tool -> approval` 这条稳定外部模型
- run-loop 驱动的执行闭环
- approval / reject / resume 的统一执行路径
- runtime 作为唯一真相源
- suspension / continuation / run-state store 的稳定恢复边界

### 2. 保持 TUI 是 shell，不是第二套状态机

重点包括：

- TUI 只消费 runtime view
- 不在界面层重新拼装业务真相
- 保持输入分发、会话同步、屏幕组合三者边界清晰
- final response 与 execution / verification / pause 摘要分层显示

### 3. 继续做结构减法

当前复杂度热点仍然存在，但已经从“完全失控”进入“可持续小步收口”阶段。
下一轮优先级仍然是：

1. session / kernel 边界继续收紧
2. runtime command / snapshot / event 协议继续稳定
3. run-loop、provider、cost、skills 这些新能力只允许沿现有主轴生长，不新建平行控制面

## 发布里程碑

### M1 - Runtime Alpha

目标：把 run-loop 从“可运行”补成“可信运行时”。

重点包括：

- continuation 归属链完整化
- suspension / continuation 生命周期显式化
- 恢复事务原子性
- approve / reject / continuation 幂等
- cancel 合同
- legacy checkpoint 一次性迁移
- `loop.*` runtime 事件
- retention / GC
- mixed recovery 语义正式入文档

退出标准：

- 审批恢复链条稳定
- 非审批 crash 不会伪装成自动续跑
- cancel / approve / reject 语义不冲突
- `loop.*` 事件进入现有 schema 与 event bus
- 根级文档与实现一致

### M2 - System Confidence

目标：把 OpenPX 变成“可证明”的系统，而不是“感觉能跑”的系统。

重点包括：

- fresh run / approval / reject / cancel / human recovery / version mismatch 场景测试矩阵
- runtime replay / review / promotion 工具链
- 失败 run 复盘报告
- 回归基线与行为退化检测

退出标准：

- 关键链路具备端到端测试覆盖
- 任何失败 run 都能说明“哪一步、为什么、有没有副作用风险”
- 回归体系能判断行为退化，而不只是测试没挂

### M3 - Provider & Cost

目标：把模型接入层从“OpenAI SDK 直连”升级为“稳定的 OpenAI-compatible 模型接入与成本控制层”。

重点包括：

- OpenAI Chat Facade（OpenAI Chat 门面层）
- OpenAI-compatible provider profile（兼容 OpenAI Chat 的 provider profile）
- `defaultModel + smallModel` 模型选择
- usage / cost / latency / error / fallback telemetry
- fallback / retry / timeout 策略层
- 至少第二家 OpenAI-compatible provider 的接入验证

本阶段明确不做：

- OpenAI Responses API
- Anthropic native / Gemini native 协议
- 跨协议 tool-calling 抽象
- provider-native adapter zoo（provider 原生适配器动物园）
- 大而全模型注册中心

退出标准：

- `run-loop` / `control plane` 不感知 provider 差异
- `ModelGateway` 不再是 OpenAI SDK 细节堆积点，而是 OpenAI-compatible facade
- Provider Profile 已上线，且能明确表达不支持参数与兼容差异
- `defaultModel + smallModel` 已进入主路径
- `model.telemetry` 已进入现有 runtime 观测路径
- fallback / retry / timeout 已策略化
- 第二家 OpenAI-compatible provider 接入不破坏 runtime、恢复与审计语义

### M4 - Agent Capability Beta

目标：在稳定 runtime 上，构建真正“好用”的 coding agent 能力。

重点包括：

- working set / evidence pack
- project rules / repo instructions
- skills / playbooks
- 最小多代理分工：Planner / Scout / Editor / Verifier
- 角色级权限边界、上下文预算与成本统计

退出标准：

- 对真实仓库任务，成功率达到可用水平
- working set 明显减少无关上下文读取
- skills 带来可量化收益
- 多代理不会破坏恢复、成本和权限边界

### M5 - Private Beta

目标：让 OpenPX 进入小范围、持续、真实的使用阶段。

重点包括：

- TUI 长会话可读性
- thread / run / task 浏览体验
- approval / reject / human_recovery 面板清晰度
- 模型状态、成本、loop 状态可见性
- durable answer 与中间摘要分层可见
- 错误信息可操作

退出标准：

- 小范围用户可连续使用 2 到 3 周
- 问题主要集中在产品体验层，而不是 runtime 正确性层
- 协议和状态语义不再频繁变动

### M6 - Release Candidate -> `v1.0`

目标：完成正式发布前的最终收口与验收。

重点包括：

- runtime command / snapshot / events 协议冻结
- `resumeDisposition` 与 `loop.*` 语义冻结
- 根级文档与知识空间文档冻结
- provider 支持矩阵、安装说明、升级说明、排障文档收口
- release checklist 验收通过

退出标准：

- RC 阶段只剩小修，不再改核心运行时语义
- 安装、运行、恢复、审批、取消、退出都可按文档复现
- 发布说明、已知限制、非目标范围全部明确

## 当前明确非目标

当前阶段，OpenPX 不优先做：

- 为了“看起来完整”而继续铺新功能
- 多前端接入优先化
- 大规模 UI polish（界面打磨）
- 重新分散业务真相到 TUI、本地 helper 或临时文档
- 新建平行架构词汇或平行控制面
- 在 runtime / hardening / system confidence 未稳定前，提前进入产品化冲刺

## 执行计划入口

如果要看当前执行计划，不要在 `ROADMAP.md` 里展开。
请进入：

- [docs/space/execution/index.md](./docs/space/execution/index.md)
- [docs/space/execution/active/index.md](./docs/space/execution/active/index.md)
- [docs/space/execution/completed/index.md](./docs/space/execution/completed/index.md)

如果要看当前默认执行方法，请进入：

- [docs/space/execution/coding-workflow.md](./docs/space/execution/coding-workflow.md)
- [docs/space/execution/validation-workflow.md](./docs/space/execution/validation-workflow.md)
- [docs/space/execution/refactor-playbook.md](./docs/space/execution/refactor-playbook.md)

## 一句话总结

OpenPX 当前不是在做“更多功能”，而是在把自己收敛成一个：

**以 run-loop 为内核、以 harness 为真相层、以 mixed recovery 为恢复承诺、以 provider / cost / skills / working set 为后续能力生长面、并最终走向 `v1.0` 的可控 code agent runtime。**
