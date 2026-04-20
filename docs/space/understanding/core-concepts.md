# Core Concepts

本文档用于统一 OpenPX 的核心术语和代码落点。

## Thread

- 中文含义：长期协作线
- 定义位置：`src/domain/thread.ts`
- 它回答的问题：
  “我们在哪条持续的工作线上？”
- 主要职责：
  保存长期上下文、恢复事实、项目归属、叙事状态，以及当前 `thread mode`

## Primary Agent

- 中文含义：主代理
- 定义位置：`src/control/agents/agent-spec.ts`
- 它回答的问题：
  “当前线程默认由哪个产品层代理承担主要工作？”
- 当前正式值：
  `Build`

## Thread Mode

- 中文含义：线程模式
- 定义位置：`src/control/agents/thread-mode.ts`
- 它回答的问题：
  “当前主代理在这条 thread 上按什么方式工作？”
- 当前正式值：
  `normal | plan`

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

## Subagent

- 中文含义：子代理合同
- 定义位置：`src/control/agents/subagent-spec.ts`
- 它回答的问题：
  “主代理按需可调用哪些专业协作单元？”
- 当前正式值：
  `Explore / Verify / Review / General`

## System Agent

- 中文含义：系统代理合同
- 定义位置：`src/control/agents/system-agent-spec.ts`
- 它回答的问题：
  “哪些代理只服务系统内部维护，而不是直接作为用户工作对象？”

## AgentRun

- 中文含义：运行实例
- 当前主要落点：
  - `src/domain/agent-run.ts`
  - `src/control/agent-runs/agent-run-manager.ts`
  - `src/surfaces/tui/components/agent-run-panel.tsx`
- 它回答的问题：
  “当前有哪些内部执行实例真的被拉起，它们处于什么生命周期状态？”
- 说明：
  `AgentRun` 已经同时成为对外和内部的正式运行实例语义；旧 `worker` 只应出现在历史设计文档里

## 概念关系

当前最稳定的外部模型是：

`primary agent(Build) -> thread(mode) -> run -> task -> tool -> approval`

其中：

- `subagent`
  是产品/合同层协作单元，不等于一定已经实例化
- `AgentRun`
  是内部运行实例，不等于 primary agent 本体
- `planner / executor / verifier / run-loop / step`
  当前是实现机制，不是用户面向的主要架构词汇

## 使用原则

- 不要用 `thread` 代替 `task` 状态
- 不要把 `task` 当作长期上下文容器
- 不要把 `Plan` 写成与 `Build` 对称的第二个主代理
- 不要把 `AgentRun` 面板解释为产品层 agent 面板
- 不要让 TUI 发明第二套业务真相
- 如果某个术语只能通过内部实现理解，应优先把它压回运行时内部
