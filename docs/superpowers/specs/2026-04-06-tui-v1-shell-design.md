# 规格说明书：TUI v1 Shell 设计

Date: 2026-04-06
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This shell-focused design is preserved for historical reference, but it is not the active implementation baseline after the reset.

## 1. 背景

agent os 内核、runtime 协议和基础 TUI 骨架已经趋于稳定，当前工作重点从“把系统跑起来”转向“把 shell 做成可长期使用的产品界面”。

仓库现状已经具备以下基础：

- `remote-kernel -> runtime snapshot/event -> RuntimeSessionState -> Ink Screen` 的基本链路已打通
- `App`、`Screen`、`InteractionStream`、`Composer`、`StatusBar`、`ThreadPanel` 等组件骨架已存在
- runtime 侧已经能通过 snapshot 和 SSE 事件提供 `thread`、`task`、`approval`、`thinking`、`text_chunk`、`blocked` 等状态

当前缺的不是从零设计协议，而是明确 TUI v1 的产品边界、交互语义和实现收敛方向。

## 2. v1 目标

TUI v1 的目标不是做成多线程调度台，也不是只会发消息的极简聊天框，而是一个单线程、chat-first、可长期挂着使用的 `Hybrid shell`。

目标包括：

- 界面简洁、克制、长期使用不疲劳
- 默认路径是“打开就能聊”，不要求用户先学习复杂命令
- 支持普通提示文本输入
- 支持 `/` 指令入口，处理确定性强的本地 shell 动作
- 支持当前线程的会话历史查看
- 支持流式输出、thinking、任务进行中状态
- 支持危险操作审批与方案选择审批
- 将 `blocked / human recovery` 与 `approval` 明确区分
- 每次进入 TUI 后先显示欢迎界面
- 欢迎界面上的首次新输入会创建新的线程
- 明确 `Esc` 的行为：只中断当前线程执行

## 3. 非目标

v1 明确不做以下内容：

- 多线程并行操作
- 面向 operator 的重型 dashboard 常驻布局
- `/approve`、`/reject`、`/resume` 这类把自然交互做重的命令
- 完整的事件日志浏览器
- 大而全的 settings 系统

其中，多线程并行操作属于 v2 预留方向，但不应该反向污染 v1 的主交互设计。

## 4. 设计原则

### 4.1 Chat First

主交互必须以当前会话流为中心。用户进入 TUI 后，不需要先打开面板、切线程、查看任务树，默认就应该能直接描述任务并看到系统持续反馈。

### 4.2 Quiet by Default

界面风格应简洁大方，避免：

- 大量边框
- 高饱和色块
- 噪声型标签
- 常驻多面板布局

视觉层级主要依靠文本密度、缩进、留白、弱色阶来建立。只有审批、阻塞、失败等真正高风险状态才使用强提示色。

### 4.3 Important State Must Be Visible In Place

所有重要状态应尽量在当前会话流中原地可见，而不是要求用户切换到另一个面板才能知道系统正在做什么。

必须原地可见的状态包括：

- 当前用户输入
- assistant 流式输出
- thinking 文本
- 正在执行的 task
- 待处理 approval
- blocked / human recovery

### 4.4 Single-Threaded On Purpose

v1 只服务当前单线程会话。虽然 runtime 和协议层已经具备 thread 视图能力，但 UI 不以多线程为主交互目标。

`/sessions` 可以保留为只读入口，用于展示已有会话概况，但不承诺 v1 支持高效的多线程切换与并行操作。

### 4.5 Fresh Start Per Launch

每次进入 TUI 后，默认先进入欢迎界面，而不是自动附着到某个已有线程并立刻显示旧会话流。

欢迎界面的目标是明确两件事：

- 用户刚进入的是一个新的 shell 入口
- 首次新输入会创建一个新的线程

这保证“启动一次 TUI = 开始一轮新的工作上下文”，而历史线程改由 `/sessions` 和 `/history` 访问。

## 5. 信息架构

### 5.1 Header

Header 只展示必要的顶层信息：

- 产品标识
- `projectId`
- `workspaceRoot`
- runtime 连接状态
- 当前 thread 的简要状态

Header 不承载任务列表、审批细节或多线程导航，避免一打开界面就信息过载。

### 5.2 Main Stream

Main Stream 是 TUI 的绝对中心，承担以下内容：

- 用户输入历史
- assistant 历史回复
- assistant 流式输出
- thinking 过程文本
- 当前任务进行中提示
- 当前 approval 提示
- 当前 blocked / human recovery 提示

设计原则是：即使完全不展开辅助面板，用户也能在主流里完成一轮完整协作。

当用户刚进入 TUI、尚未创建当前线程时，Main Stream 应显示欢迎界面而不是历史内容。欢迎界面至少应包含：

- 产品名或简短欢迎语
- 当前 workspace / project 信息
- 一句明确提示：发送新的输入会创建一个新的线程
- `/help`、`/sessions`、`/settings` 等起步入口

### 5.3 Context Drawer

Context Drawer 默认收起，仅在用户主动展开时展示补充信息。v1 中它只承载当前会话相关内容：

- Tasks
- Approvals
- Runtime / Session facts

v1 不把 thread list 做成默认常驻区域，因为这会把单线程 shell 误导成会话管理器。

### 5.4 Composer + Footer

底部输入区域承担以下三种模式：

- 普通输入态
- 审批确认态
- blocked 禁用态

Footer 只放少量持续有价值的底层信息，例如模型名称、计时信息、少量快捷键提示，不引入第二个重型状态面板。

## 6. 输入与命令模型

### 6.1 普通输入

默认输入即自然语言提示，直接提交给当前 thread。

它承担：

- 新任务描述
- 对当前任务的追问或补充
- 要求继续、修改、细化
- 审批语境中的自然语言确认

### 6.2 `/` 命令

以 `/` 开头的输入由 TUI 本地优先解析，不直接发送给模型。命令用于处理“确定性强、无需模型理解”的 shell 动作。

v1 建议内置以下命令：

- `/new`：新建会话
- `/plan`：发起规划型输入
- `/history`：查看当前线程历史
- `/sessions`：查看本地会话列表，v1 以只读为主
- `/clear`：清空当前屏幕显示，不删除底层历史
- `/settings`：打开设置视图，v1 只支持少量本地设置
- `/help`：展示命令和快捷键帮助

### 6.3 不进入 v1 的命令

以下命令不应进入 v1：

- `/approve`
- `/reject`
- `/resume`

原因：

- 审批应通过当前语境下的自然确认完成，而不是额外记忆命令
- “继续当前会话”应尽量变成默认行为，而不是单独学习一条命令

### 6.4 启动后的首次输入语义

TUI 每次启动后默认处于“尚未创建当前线程”的欢迎态。

在这个状态下：

- 第一条普通输入会创建一个新线程，然后作为该线程的首条任务提交
- 第一条 `/plan ...` 输入也会创建一个新线程，并以规划型意图提交
- `/sessions` 与 `/history` 可以查看历史，但不会改变“本次启动默认从新线程开始”的原则

`/new` 在 v1 中仍然保留，但它的意义变成“在当前 TUI 会话中显式开始下一条新线程”，而不是“补回启动时缺失的新线程创建逻辑”。

## 7. 会话历史

当前线程的会话历史是 v1 核心能力，但展示要克制，避免把主流变成全量事件日志。

v1 采用三层历史模型：

1. 主流中的近期对话与流式输出
2. 当前线程一旦创建，可由 durable answer 或 narrative summary 提供回填摘要
3. 用户通过 `/history` 查看更完整的当前线程历史

v1 的 `/history` 应聚焦“当前 thread 的可读会话轨迹”，而不是暴露完整底层事件序列。

由于每次启动默认先进入欢迎界面，历史线程内容不应在用户未主动创建新线程前自动占据主流。

## 8. 审批与阻塞边界

### 8.1 Approval 的定义

v1 中，Approval 严格收敛为两类：

1. 危险操作审批
2. 方案选择审批

对应语义分别是：

- `permission gate`
- `decision gate`

### 8.2 Blocked / Human Recovery 的定义

以下情况不归类为 Approval，而应被视为另一种状态：

- 线程进入人工恢复态
- 需要用户检查工作区或外部状态后才能继续
- 系统无法在当前上下文下安全推进

这类状态应以 `blocked / human recovery` 单独展示，而不是伪装成审批。

### 8.3 审批交互方式

审批不通过命令完成，而通过 Composer 的上下文确认态完成。

建议规则：

- 当存在明确 approval 时，Composer 进入确认语义
- 用户可以输入 `y / n / yes / no / 可以 / 不行` 等自然确认词
- TUI 在本地做归一化，再映射为 approve/reject 动作

这样做的原因是减少命令记忆成本，并保持审批动作和当前会话语境连续。

## 9. Esc 语义

`Esc` 在 v1 中定义为：

- 只中断当前线程执行

这是一条强语义，不应模糊。

因此：

- 如果当前线程正在执行，TUI 需要向 runtime 发出 interrupt / stop 语义
- 如果当前线程空闲，`Esc` 不承担退出语义
- 如果中断失败，TUI 至少需要给用户一条清晰反馈

关键目标是让 `Esc` 始终表达“停止当前线程”，而不是混入“退出界面”的额外副作用。退出 TUI 应由独立动作处理，例如专用快捷键、显式命令或宿主终端关闭行为。

## 10. TUI 状态模型

TUI 不应只被动渲染 snapshot，也不应把所有瞬时状态直接散落在 `App.tsx` 中。v1 建议增加一层轻量 `ViewState` 收敛层。

建议分成四块：

- `session`：当前 thread 的稳定投影
- `composer`：输入态、确认态、blocked 态
- `stream`：当前流式输出、thinking buffer、性能计时
- `ui`：drawer 开关、focus、命令面状态、退出状态
- `launch`：欢迎态、是否已在本次启动中创建当前线程

### 10.1 Snapshot 的职责

snapshot 提供稳定事实，例如：

- 当前 `threadId`
- 当前 `summary`
- `tasks`
- `approvals`
- `blockingReason`
- `narrativeSummary`
- `workspaceRoot`
- `projectId`

### 10.2 Event 的职责

event 驱动瞬时体验，例如：

- `stream.thinking_started`
- `stream.thinking_chunk`
- `stream.text_chunk`
- `model.status`
- `task.*`
- `thread.view_updated`

结论是：

- snapshot 决定“真实世界现在是什么”
- event 决定“用户感知到它如何变化”

## 11. 与现有 runtime 边界的关系

### 11.1 现有链路继续保留

v1 不推翻现有协议与 remote kernel 结构，继续沿用：

- `RuntimeClient`
- `createRemoteKernel`
- `RuntimeSessionState`
- snapshot + SSE event 的双通道模型

### 11.2 `/plan` 的处理

`/plan` 不要求 v1 先发明一套全新的 runtime 协议。

推荐方式是：

- TUI 本地先把 `/plan xxx` 解析为一种明确的规划型提交
- 底层仍优先复用现有 `submit_input` 或兼容命令入口
- 后续如果 runtime 引入显式 `plan intent`，再单独演进

### 11.3 `/history` 和 `/sessions`

这两个命令优先作为 TUI 侧视图入口，必要时通过已有 snapshot 数据驱动。v1 不要求 runtime 先补齐复杂导航协议。

## 12. 实现策略

v1 推荐沿用现有 TUI 骨架，在此基础上渐进增强，而不是重写 UI。

推荐顺序：

1. 先收敛 TUI 状态层，减少 `App.tsx` 中直接散落的状态逻辑
2. 再补欢迎界面与“首次输入创建新线程”的启动语义
3. 再完善 Composer 与 `/` 命令解析
4. 再增强 Main Stream 与当前线程历史能力
5. 最后补齐简洁的 Context Drawer 和 settings/help 视图

这样可以在不重写协议的前提下，把现有骨架推进成可用的 v1 shell。

## 13. v1 验收标准

- [ ] 默认打开后可直接输入自然语言任务
- [ ] 每次进入 TUI 后默认先显示欢迎界面
- [ ] 首次新输入会创建新的线程
- [ ] `/` 命令体系可用，且不与普通输入混淆
- [ ] 当前线程近期会话历史可读
- [ ] 思考过程、流式输出、运行中任务可在主流中看到
- [ ] approval 与 blocked/human recovery 在视觉与语义上清晰分离
- [ ] `Esc` 只中断当前线程执行，不承担退出语义
- [ ] v1 不依赖多线程并行操作也能形成完整闭环

## 14. v2 预留

以下内容留给后续版本：

- 多线程切换与并行态展示
- 更强的 session navigator
- worker 级别可视化
- 更完整的 settings 面板
- 更细粒度的 operator 视图

v2 可以在 v1 的 `ViewState`、命令面和 drawer 结构上自然扩展，不需要重新定义 shell 核心语义。
