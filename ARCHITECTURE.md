# OpenPX 架构导航

本文档是 OpenPX 的架构导航页。

OpenPX 当前采用 harness-first（以 harness 为先）架构。
系统本体是共享 harness（共享执行基座，负责运行时内核、thread 生命周期、事件流、审批与恢复边界），
TUI 只是默认 surface（交互表面），而不是产品主轴本身。

它负责回答三个问题：

1. 系统主轴是什么
2. 各主要模块边界是什么
3. 需要更深信息时，应该去 `docs/space/` 的哪里继续读

本文档不是最终控制权威。  
当它与 [CONTROL.md](/Users/chenchao/Code/ai/openpx/CONTROL.md) 冲突时，以 `CONTROL.md` 为准。

## 默认阅读顺序

无论是人还是 AI，默认都按这个顺序进入仓库：

1. [AGENTS.md](/Users/chenchao/Code/ai/openpx/AGENTS.md)
2. [CONTROL.md](/Users/chenchao/Code/ai/openpx/CONTROL.md)
3. [ARCHITECTURE.md](/Users/chenchao/Code/ai/openpx/ARCHITECTURE.md)

只有在上面三份文档还不足以回答问题时，才继续进入 `docs/space/`。

## 系统主轴

当前从代码和测试可确认的系统主轴是：

`package.json -> src/app/main.ts -> src/runtime/service/runtime-daemon.ts -> src/harness/server/harness-session-registry.ts -> harness core / protocol / app server -> surfaces`

在当前 harness-first 语义下，最终回答与中间阶段摘要必须分层：

- responder 负责生成最终回答（final response）
- planner / executor / verifier / approval / recovery 只产生各自阶段数据
- durable answer 只回写 final response
- pause、verification、execution 摘要只属于控制面与 surface 投影视图

这条主轴的含义是：

- `main.ts`
  产品入口，负责选择并附加默认 surface
- `runtime-daemon.ts`
  负责复用或启动共享运行时
- `harness-session-registry.ts`
  负责装配 scope（作用域）级 harness session 与执行基座
- `harness core`
  负责 thread、run、approval、recovery、projection（投影视图）和 event stream（事件流）
- `protocol / app server`
  负责把 harness 暴露为稳定客户端协议
- `surfaces`
  负责 TUI、CLI、Web、IDE 等不同交互表面

当前默认 surface 是 TUI，但 TUI 不是系统真相源，也不是架构主轴终点。

## 主要模块边界

### 产品主路径

- `src/app/`
  应用入口与装配根
- `src/runtime/`
  当前仅保留 daemon 与少量装配支撑；不再作为核心运行时主语
- `src/harness/`
  harness core、protocol、app server 与 eval loop 的正式代码落位
- `src/surfaces/`
  当前默认 surface（主要是 TUI）及其 adapter、视图与交互壳

### 目标边界（harness-first）

- `harness core`
  thread / run / approval / recovery / projection / event stream 的真相层
- `protocol / app server`
  面向 surface 的稳定契约层
- `surfaces`
  TUI、CLI、Web、IDE 等客户端表面

目录层面的 `harness/` / `surfaces/` 收束已成为默认代码边界；
遗留的 `runtime/` 主要承担 daemon 与少量内部支撑，不再定义系统主轴。

### 运行时内部支撑

- `src/control/`
  控制面（control plane），负责审批、工具策略、任务生命周期与 worker 协调
- `src/domain/`
  核心实体与生命周期规则
- `src/infra/`
  外部模型与 provider 接入支撑。当前收敛方向是 OpenAI-compatible facade + provider profile + policy（策略）层，而不是 provider-native adapter zoo
- `src/config/`
  正式配置子系统，负责多层 JSONC 读取、merge、校验、标准化与 capability 目录发现
- `src/persistence/`
  SQLite 与持久化端口实现
- `src/shared/`
  runtime-facing 配置适配器、ID 生成器与小型共享原语

### 模型层边界

当前模型层的正式目标不是“支持尽可能多的原生协议”，而是：

- 让 `ModelGateway` 成为 OpenAI-compatible facade（兼容 OpenAI Chat 的门面层）
- 让 provider 差异收敛到 profile / policy / transport
- 让 run-loop、control plane 和 surface 不直接接触 provider SDK 细节

在这个边界下：

- provider profile 描述 `baseURL`、`apiKey`、默认模型、小模型与能力差异
- transport client 只负责 OpenAI Chat Completions 调用、streaming、timeout / abort
- telemetry / fallback / retry / timeout 都走正式控制面，而不是散落在 surface 或 run-loop 里

### 配置系统边界

OpenPX v1 的正式配置边界是：

- `src/config/*`
  多层 JSONC 配置系统，负责路径发现、merge、schema、校验和目录索引
- `src/shared/config.ts`
  runtime-facing 适配层，把 `ResolvedOpenPXConfig` 投影成当前 `AppConfig`

当前三层路径固定为：

- user：
  Linux / macOS：`~/.openpx/openpx.jsonc`
  Windows：`%USERPROFILE%\\.openpx\\openpx.jsonc`
- `<workspaceRoot>/.openpx/openpx.jsonc`
- `<workspaceRoot>/.openpx/settings.local.jsonc`

TUI settings 已经硬迁移到主配置里的 `ui.tui`，不再维护独立的 `.openpx/config.json` 体系。

### 次要工具通道

- `src/eval/`
  确定性内部评估工具
- `src/harness/eval/`
  harness feedback loop（反馈闭环），负责 real-eval、review、replay 与 promotion
- `src/validation/`
  正式验证封装

这些通道必须可运行，但不重新定义产品主架构。

## `docs/space/` 的作用

`docs/space/` 是 OpenPX 的官方知识空间。  
它的目标不是取代根级控制文档，而是为 AI coding automation 提供按索引进入的结构化知识库。

它分为两条主线：

- `understanding/`
  理解型空间，帮助快速建立正确心智模型
- `execution/`
  执行型空间，帮助 AI 在改代码、验证、评估和重构时保持可控

另外还有两个降权区域：

- `references/`
  外部参考资料
- `generated/`
  生成或派生文档，默认不作为长期权威

执行空间内部还保留两个计划目录：

- `execution/active/`
  当前活跃执行计划
- `execution/completed/`
  已完成执行计划

## 进入 `docs/space/` 的规则

如果目标是：

- 看懂系统
  从 `docs/space/understanding/index.md` 开始
- 执行改动或验证
  从 `docs/space/execution/index.md` 开始
- 查外部材料
  从 `docs/space/references/` 开始
- 看 AI 生成或派生材料
  从 `docs/space/generated/` 开始，但默认降权

不要默认全扫 `docs/space/`。  
始终先看索引，再进入具体专题。

## 当前推荐阅读路径

### 想快速理解系统

1. [docs/space/index.md](/Users/chenchao/Code/ai/openpx/docs/space/index.md)
2. [docs/space/understanding/index.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/index.md)
3. [docs/space/understanding/runtime-spine.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/runtime-spine.md)
4. [docs/space/understanding/core-concepts.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/core-concepts.md)
5. [docs/space/understanding/state-flows.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/state-flows.md)

### 想理解 harness-first 代码落位

1. [docs/space/understanding/harness-code-map.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-code-map.md)
2. [docs/space/understanding/harness-protocol-code-map.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-protocol-code-map.md)
3. [docs/space/understanding/harness-feedback-loop.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-feedback-loop.md)
4. [docs/space/understanding/harness-surface-boundary.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-surface-boundary.md)

### 想开始安全改代码

1. [docs/space/index.md](/Users/chenchao/Code/ai/openpx/docs/space/index.md)
2. [docs/space/execution/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/index.md)
3. [docs/space/execution/coding-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/coding-workflow.md)
4. [docs/space/execution/validation-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/validation-workflow.md)
5. [docs/space/execution/refactor-playbook.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/refactor-playbook.md)
6. [docs/space/execution/tech-debt-tracker.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/tech-debt-tracker.md)

## 非目标

当前阶段，`ARCHITECTURE.md` 不负责：

- 长篇产品愿景
- 执行计划正文
- 大量 generated 内容的托管
- 重新建立平行控制权威
- 把 TUI 误写为系统本体
