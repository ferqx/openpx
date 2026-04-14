# Core Concepts

本文档用于统一 OpenPX 的核心术语和代码落点。

## Thread

- 中文含义：长期协作线
- 定义位置：`src/domain/thread.ts`
- 它回答的问题：
  “我们在哪条持续的工作线上？”
- 主要职责：
  保存长期上下文、恢复事实、项目归属与叙事状态

## Run

- 中文含义：一次执行尝试
- 定义位置：`src/domain/run.ts`
- 它回答的问题：
  “这次执行尝试现在发生了什么？”
- 主要职责：
  记录一次尝试的生命周期，例如 `running`、`waiting_approval`、`blocked`、`completed`

## Task

- 中文含义：当前工作步骤
- 定义位置：`src/domain/task.ts`
- 它回答的问题：
  “Agent 当前正在做什么具体步骤？”
- 主要职责：
  表示 run 内当前短期工作单元，而不是整个长期上下文

## Approval

- 中文含义：审批请求
- 定义位置：`src/domain/approval.ts`
- 它回答的问题：
  “哪个高风险动作正在等待人工确认？”
- 主要职责：
  把高风险工具调用绑定回 thread / run / task，并保存审批状态

## Runtime

- 中文含义：运行时
- 主要落点：
  - `src/runtime/`
  - `src/runtime/service/`
- 它回答的问题：
  “系统真实状态和状态流转由谁持有？”
- 主要职责：
  持有状态真相、发布事件、提供快照、支持恢复与继续执行

## Kernel

- 中文含义：内核边界
- 主要落点：
  - `src/harness/core/session/session-kernel.ts`
  - `src/surfaces/tui/runtime/remote-kernel.ts`
- 它回答的问题：
  “TUI 可以通过什么稳定接口驱动系统？”
- 主要职责：
  暴露稳定命令边界，屏蔽更重的 control plane 细节

## Protocol

- 中文含义：协议层
- 主要落点：
  - `src/harness/protocol/`
  - `src/surfaces/tui/runtime/`
- 它回答的问题：
  “runtime 与外部 client/TUI 之间如何交换命令、事件和视图？”

## 概念关系

当前最稳定的外部模型是：

`thread -> run -> task -> tool -> approval`

其中：

- `worker`
  当前是内部运行时概念，不是主要产品概念
- `planner / executor / verifier / graph / node`
  当前是实现机制，不是用户面向的主要架构词汇

## 使用原则

- 不要用 `thread` 代替 `task` 状态
- 不要把 `task` 当作长期上下文容器
- 不要让 TUI 发明第二套业务真相
- 如果某个术语只能通过内部实现理解，应优先把它压回运行时内部
