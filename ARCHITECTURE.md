# OpenPX 架构导航

本文档是 OpenPX 的架构导航页。

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

当前从代码和测试可确认的产品主轴是：

`package.json -> src/app/main.ts -> src/runtime/service/runtime-daemon.ts -> src/runtime/service/runtime-service.ts -> src/interface/runtime/runtime-client.ts -> src/interface/runtime/remote-kernel.ts -> src/interface/tui/app.tsx`

这条主轴的含义是：

- `main.ts`
  产品 CLI/TUI 入口
- `runtime-daemon.ts`
  负责复用或启动共享运行时（runtime，运行时）
- `runtime-service.ts`
  负责运行时服务装配与 scope（作用域）级别的执行基座
- `runtime-client.ts` / `remote-kernel.ts`
  把运行时状态与命令桥接到 TUI
- `app.tsx`
  负责顶层状态连接、输入分发和屏幕组合

## 主要模块边界

### 产品主路径

- `src/app/`
  应用入口与装配根
- `src/runtime/`
  运行时、graph（图执行）、协议与会话服务
- `src/interface/`
  TUI、runtime client 与远程内核适配
- `src/kernel/`
  稳定命令边界与会话投影

### 运行时内部支撑

- `src/control/`
  控制面（control plane），负责审批、工具策略、任务生命周期与 worker 协调
- `src/domain/`
  核心实体与生命周期规则
- `src/persistence/`
  SQLite 与持久化端口实现
- `src/shared/`
  配置、ID 生成器与小型共享原语

### 次要工具通道

- `src/eval/`
  确定性内部评估工具
- `src/real-eval/`
  实时或追踪支持的评估工具
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
