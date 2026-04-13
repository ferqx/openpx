# OpenPX 控制构件

本文档是仓库恢复的权威控制构件。

## 真相层级

当信息来源不一致时，按以下顺序判断：

1. 运行行为
2. 测试
3. 代码
4. 本文件中明确列入白名单的文档
5. 其他一切

默认情况下，所有文档均无权威性，除非出现在下面的白名单中。

## 文档白名单

只有以下仓库文档可以默认指导实现或规划：

- `CONTROL.md`
- `AGENTS.md`
- `NOISE_CANDIDATES.md`
- `ROADMAP.md`
- `README.md`

OpenPX 采用根级文档模型。除非本文档明确更改，否则不要将任何恢复的 `docs/` 树视为权威。

## 运行时主轴

以下是从代码和测试推导出的当前主要产品路径：

1. `package.json`
   主要脚本：`bun run dev`
2. `src/app/main.ts`
   产品 CLI/TUI 入口
3. `src/runtime/service/runtime-daemon.ts`
   确保或启动共享运行时进程
4. `src/runtime/service/runtime-service.ts`
   负责运行时服务构建和执行基座
5. `src/interface/runtime/runtime-client.ts`
   连接 TUI 和共享运行时
6. `src/interface/runtime/remote-kernel.ts`
   将运行时操作适配到 TUI 可见的内核表面
7. `src/interface/tui/app.tsx`
   渲染用户面向的 TUI 并驱动交互

最小端到端循环：

- 用户启动 `bun run dev`
- `src/app/main.ts` 确保运行时守护进程
- TUI 通过 `RuntimeClient` 附加
- 用户输入通过远程内核进入运行时拥有的状态和命令

## 代码阅读顺序

如果要重新理解当前主路径，按这个顺序读：

1. `src/app/main.ts`
   产品入口，负责启动或连接 runtime，然后挂载 TUI
2. `src/runtime/service/runtime-daemon.ts`
   决定复用还是新建 runtime daemon
3. `src/runtime/service/runtime-service.ts`
   为不同 scope 组装并缓存 runtime session
4. `src/runtime/service/runtime-scoped-session.ts`
   维护 active thread、组装 snapshot、转发实时事件
5. `src/app/bootstrap.ts`
   装配 stores、model gateway、control plane、kernel
6. `src/kernel/session-kernel.ts`
   把 submit/approve/reject 这些命令投影成统一 session 视图

如果只是想看次级工具链，不要从它们开始：

- `src/eval/run-suite.ts`
- `src/real-eval/run-suite.ts`
- `src/validation/run-suite.ts`

这三个文件只是 CLI 壳层，不是产品主架构入口。

## 核心概念映射

如果你想先理解数据模型，再理解调用链，按这四个概念看：

## 术语表

为了降低技术术语理解门槛，后续注释和说明默认按下面这套中英对照执行：

- `runtime`
  运行时。指真正持有状态、执行命令、发布事件的执行基座。
- `daemon`
  守护进程。指后台常驻、可被复用的 runtime 服务进程。
- `scope`
  作用域。这里特指一个 `workspaceRoot + projectId` 组合。
- `snapshot`
  快照。指某个时刻 runtime 对外暴露的完整状态视图。
- `kernel`
  内核边界。这里不是操作系统内核，而是 TUI 与 control plane 之间的稳定命令边界。
- `control plane`
  控制面。负责审批、工具策略、任务生命周期、run 推进等协调逻辑。
- `protocol`
  协议层。指 runtime 与 TUI / client 之间传递命令、事件、视图的接口层。
- `projection` / `projected view`
  投影视图。指把底层 durable 状态整理成 UI 可直接消费的视图结果。
- `hydrate`
  水合 / 回填。指从持久化状态恢复出当前 session 视图，而不是重新生成一份业务状态。
- `resume`
  恢复继续执行。指从 blocked / interrupted / waiting_approval 状态重新推进 run。
- `interrupt`
  中断。指人为停止当前 run 的继续推进。
- `worker`
  内部工作单元。当前是 runtime 内部实现概念，不是主要产品概念。

### Thread

- 定义文件：`src/domain/thread.ts`
- 真实职责：表示一条长期协作线，而不是某一步执行
- 关键归属：
  - `workspaceRoot`
  - `projectId`
  - narrative / recovery 相关持久状态
- 主要使用位置：
  - `src/runtime/service/runtime-scoped-session.ts`
  - `src/kernel/session-kernel.ts`
  - `src/app/bootstrap.ts`

### Run

- 定义文件：`src/domain/run.ts`
- 真实职责：表示 thread 内一次执行尝试
- 关键归属：
  - `status`
  - `trigger`
  - `activeTaskId`
  - `blockingReason`
- 主要使用位置：
  - `src/app/bootstrap.ts`
  - `src/kernel/session-kernel.ts`
  - `src/runtime/service/runtime-scoped-session.ts`

### Task

- 定义文件：`src/domain/task.ts`
- 真实职责：表示 run 内当前具体步骤
- 关键归属：
  - `summary`
  - `status`
  - `blockingReason`
- 主要使用位置：
  - `src/control/tasks/task-manager.ts`
  - `src/app/bootstrap.ts`
  - `src/kernel/session-kernel.ts`
  - `src/runtime/service/runtime-scoped-session.ts`

### Approval

- 定义文件：`src/domain/approval.ts`
- 真实职责：表示一次必须人工确认的高风险工具动作
- 关键归属：
  - `toolCallId`
  - `toolRequest`
  - `risk`
  - `status`
- 主要使用位置：
  - `src/control/policy/approval-service.ts`
  - `src/app/bootstrap.ts`
  - `src/kernel/session-kernel.ts`
  - `src/runtime/service/runtime-scoped-session.ts`

## 命令流映射

当前主路径里，一条用户输入大致这样流转：

1. `src/app/main.ts`
   启动或连接 runtime，并把 TUI 接到 runtime client
2. `src/runtime/service/runtime-daemon.ts`
   复用或新建共享 runtime
3. `src/runtime/service/runtime-service.ts`
   为当前 scope 获取 runtime session
4. `src/runtime/service/runtime-scoped-session.ts`
   把协议命令交给 runtime command handler，并负责 snapshot / event 读取
5. `src/kernel/session-kernel.ts`
   解析当前 thread/run/task/approval 上下文，启动后台 control-plane 工作
6. `src/app/bootstrap.ts`
   control plane 继续推进 graph、tool、approval、run/task 状态

因此概念关系应理解成：

- `thread` 回答：我们在处理哪条长期工作线
- `run` 回答：这次执行尝试现在处于什么状态
- `task` 回答：当前这一步具体在做什么
- `approval` 回答：哪一个高风险 tool call 正在等待人工确认

## 状态流检查点

当前主路径最重要的状态流转检查点如下：

### 用户提交输入

- 入口：`src/runtime/service/runtime-command-handler.ts`
- 转换：`add_task` / `plan_task` 最终都转成 `submit_input`
- 会话边界：`src/kernel/session-kernel.ts`
- 真正推进：`src/app/bootstrap.ts` 中的 `controlPlane.startRootTask(...)`

### 新建执行

- `startRootTask(...)` 会：
  - 创建 `Run`
  - 把 `Run` 置为 `running`
  - 创建根 `Task`
  - 把 `Task` 置为 `running`
  - 调用 `rootGraph.invoke(...)`

### 等待审批

- 如果 graph 执行期间产生 pending approval 或 interrupt：
  - `Task` 会变成 `blocked`
  - `Run` 会变成 `waiting_approval`
- 这时 UI 看到的是：
  - thread 有 pending approval
  - task 被阻塞
  - approval 面板出现待确认动作

### 批准后恢复

- 入口：`approve_request`
- 如果存在 checkpoint，系统会继续走 graph resume
- 如果没有 checkpoint，系统直接执行已经批准的 tool request
- 两条路径的共同目标都是：
  - 让当前 `Run` 继续推进
  - 最终更新 `Task` / `Run` 的完成状态

### 拒绝后恢复

- 入口：`reject_request`
- 如果存在 checkpoint：
  - 当前 task 会先结束
  - 系统构造“拒绝该动作后的原因”
  - 然后重新调用 `startRootTask(...)` 触发 replan
- 所以 reject 不是简单停止，而是“带着拒绝原因重新规划”

## 结构减法进展

当前结构减法已开始，并且坚持“小步迁移，不改行为”的原则。

### 第一刀：`bootstrap.ts` 支持逻辑抽离

- 已新增：`src/app/control-plane-support.ts`
- 当前已迁出的内容：
  - task 状态落盘辅助
  - approval tool request 还原
  - resume 输入归一化
  - responder prompt 组装
  - 若干不属于 control-plane 主流程的支持函数

这一步的意义是：

- 让 `src/app/bootstrap.ts` 更接近“装配根 + control-plane 主流程”
- 减少“主流程代码”和“支持性小工具函数”混在一起的程度
- 在不改变运行行为的前提下，为后续继续拆分创造边界

### 第二刀：`bootstrap.ts` 中的 approval 处理抽离

- 已新增：`src/app/control-plane-approval-resolution.ts`
- 当前已迁出的内容：
  - `approveRequest` 的批准恢复主流程
  - `rejectRequest` 的拒绝恢复与 replan 主流程
  - approval fallback task 的构造逻辑

这一步的意义是：

- 让 `bootstrap.ts` 不再同时背着“approval 处理细节”和“control-plane 总装逻辑”
- 把 approval resolution 变成可单独阅读、单独继续拆分的一层
- 为后续继续切出 run/task lifecycle 留出更清晰的边界

### 第三刀：`bootstrap.ts` 中的 run/task lifecycle 抽离

- 已新增：`src/app/control-plane-run-lifecycle.ts`
- 当前已迁出的内容：
  - root task 启动前的 run/task 准备逻辑
  - graph 返回后的 run/task 收口逻辑
  - `waiting_approval / completed` 的统一判定和状态更新

这一步的意义是：

- 让 `bootstrap.ts` 不再直接承载整段 run/task 生命周期细节
- 把“control-plane 主流程”和“生命周期推进规则”分成两层
- 为后续继续拆出 graph bridging 和 app context assembly 创造边界

### 第四刀：`bootstrap.ts` 中的 graph bridging 抽离

- 已新增：`src/app/control-plane-graph-bridge.ts`
- 当前已迁出的内容：
  - control-plane 侧对“fresh invoke / resume invoke”的分支判定
  - `resume` 输入的归一化入口
  - graph 调用桥接层与 `bootstrap.ts` 主流程的边界

这一步的意义是：

- 让 `bootstrap.ts` 不再直接持有“是否 resume、如何选择 graph 调用形态”的判定细节
- 把 LangGraph 调用桥接收窄为一层独立模块，降低 control-plane 主流程对 graph 泛型细节的暴露
- 明确批准恢复除了 `resume` 结构外，还必须把 `approval_request_id` 继续透传到 graph configurable 中，才能避免已批准工具再次落回等待审批

### 第五刀：`createAppContext` 装配根收口

- 已新增：`src/app/app-context-assembly.ts`
- 当前已迁出的内容：
  - 持久化层初始化（sqlite、stores、checkpoint、异常执行恢复）
  - model gateway 解析
  - 服务层装配（narrative、scratch policy、memory consolidator、control plane、worker manager、kernel）
  - model gateway 到 kernel 的事件桥接
  - 资源关闭顺序

这一步的意义是：

- 让 `createAppContext` 读起来变成固定的五步装配顺序，而不是一段长初始化脚本
- 把“装配根职责”和“control-plane 业务推进职责”分开，避免 `bootstrap.ts` 再次回涨成全能文件
- 为下一步处理 `src/interface/tui/app.tsx` 之前，先把主产品入口的装配逻辑稳定下来

### 第六步第一刀：`app.tsx` 中的状态支持逻辑抽离

- 已新增：`src/interface/tui/app-state-support.ts`
- 当前已迁出的内容：
  - 对话显示状态模型
  - approval 输入判定
  - utility pane session 快照构造
  - utility pane 快照相等性比较

这一步的意义是：

- 先把 `app.tsx` 里最纯的支持逻辑抽出去，降低顶层 TUI 协调器的阅读噪声
- 消除 `app.tsx` 和 `app-screen-view.ts` 之间重复维护的一份对话状态定义
- 在不触碰事件流和交互行为的前提下，为后续继续拆“会话同步”和“输入处理”留出更清晰的边界

### 第六步第二刀：`app.tsx` 中的会话同步层抽离

- 已新增：`src/interface/tui/app-session-support.ts`
- 当前已迁出的内容：
  - session result 到 TUI session state 的同步逻辑
  - kernel event 到 TUI 状态更新的分发逻辑
  - `thread.view_updated / session.updated / stream.*` 等事件对应的会话同步规则

这一步的意义是：

- 把 `app.tsx` 中最重的一段“状态同步 + 事件分发”从顶层组件里移出
- 让顶层 TUI 文件更接近“组合状态、连接回调、渲染 Screen”的协调器角色
- 为后续继续拆输入处理和 launch/utility pane 状态时，保留清晰的同步边界

### 第六步第三刀：`app.tsx` 中的输入分发层抽离

- 已新增：`src/interface/tui/app-input-support.ts`
- 当前已迁出的内容：
  - composer mode 判定
  - shell stage 推导
  - approval 输入提交路径
  - 本地 slash command 分发
  - 普通 submit / plan 提交路径
  - launch thread 保障逻辑

这一步的意义是：

- 把 `app.tsx` 里“如何解释输入、如何分发命令、如何驱动 launch/utility pane 状态”的逻辑从顶层组件中移出
- 让顶层 TUI 组件进一步收窄成状态连接与视图组合层
- 为第七步总收口前，先把 `app.tsx` 的主要复杂度热点拆成状态支持、会话同步、输入分发三层

## 当前收口状态

到当前阶段，仓库已经从“入口、文档、状态边界都混杂”收回到下面这个程度：

- 根级文档已经收口，默认只看 `CONTROL.md`、`AGENTS.md`、`ROADMAP.md`、`README.md`、`NOISE_CANDIDATES.md`
- 产品主路径已经稳定为：
  `main.ts -> runtime-daemon -> runtime-service -> runtime-client -> remote-kernel -> app.tsx`
- `bootstrap.ts` 已经完成五刀，主要复杂度被拆成：
  - `control-plane-support`
  - `control-plane-approval-resolution`
  - `control-plane-run-lifecycle`
  - `control-plane-graph-bridge`
  - `app-context-assembly`
- `app.tsx` 已经完成三刀，主要复杂度被拆成：
  - `app-state-support`
  - `app-session-support`
  - `app-input-support`
- 当前可以把产品主线理解成：
  runtime 持有真相
  kernel 暴露稳定命令边界
  TUI 负责消费 session/view 并组织本地交互

这不代表仓库已经“简单”，但代表它已经重新具备可解释的主轴和可持续的小步重构边界。

## TUI 视图映射

如果你是从界面反推代码，按这个映射看：

### App 总装层

- `src/interface/tui/app.tsx`
  TUI 顶层状态协调器，负责把 kernel 返回的 session 状态整理成 screen 所需的数据
- `src/interface/tui/app-screen-view.ts`
  视图组装层，把 session 数据拆成 conversation / utility / chrome / composer 四块
- `src/interface/tui/screen.tsx`
  屏幕布局层，决定线程面板、主交互流、工具面板、输入框、状态栏如何摆放

### 线程面板

- 组件文件：`src/interface/tui/components/thread-panel.tsx`
- 直接数据来源：`ThreadSummary`
- 实际上对应：`ThreadView[]`
- 你在界面上看到的内容主要来自：
  - `threadId`
  - `activeRunStatus`
  - `pendingApprovalCount`
  - `blockingReasonKind`
  - `narrativeSummary`

### 任务显示

- 组件文件：`src/interface/tui/components/task-panel.tsx`
- 直接数据来源：`TaskSummary`
- 实际上对应：`TaskView[]`
- 你在界面上看到的内容主要来自：
  - `taskId`
  - `summary`
  - `status`
  - `blockingReason`

### 审批显示

- 组件文件：`src/interface/tui/components/approval-panel.tsx`
- 直接数据来源：`ApprovalSummary`
- 实际上对应：`ApprovalView[]`
- 你在界面上看到的内容主要来自：
  - `approvalRequestId`
  - `summary`
  - `status`
  - `risk`

### 主交互流

- 组件文件：`src/interface/tui/components/interaction-stream.tsx`
- 上游组装文件：`src/interface/tui/app-screen-view.ts`
- 混合展示内容：
  - 用户/助手消息
  - 任务状态
  - 审批状态
  - worker 状态
  - narrativeSummary

这意味着主交互流不是单一实体视图，而是把多种 view 混排后的结果。

### 状态栏

- 组件文件：`src/interface/tui/components/status-bar.tsx`
- 主要来源：
  - 当前 model 信息
  - thinking level
  - `SessionStage`
  - 当前 workspaceRoot

状态栏显示的是"当前会话阶段"，不是 thread/run/task 的完整持久化状态。

## 存储到视图映射

这四个核心概念在系统里有三种存在形态：

1. domain 实体
   定义业务对象本身，例如 `Thread`、`Run`、`Task`、`ApprovalRequest`
2. store 持久化记录
   存进 sqlite，例如：
   - `sqlite-thread-store.ts`
   - `sqlite-run-store.ts`
   - `sqlite-task-store.ts`
   - `sqlite-approval-store.ts`
3. protocol / TUI 视图
   给 runtime client 和 TUI 使用，例如：
   - `thread-view.ts`
   - `run-view.ts`
   - `task-view.ts`
   - `approval-view.ts`

理解时要始终区分：

- domain 实体：系统内部"真实对象"
- store 记录：对象如何被持久化
- view：对象如何被展示给界面

## 支持的脚本

### 主要

- `bun run dev`
- `bun test`
- `bun run typecheck`

### 次要

- `bun run smoke:planner`
- `bun run eval:core`
- `bun run eval:suite`
- `bun run eval:review`
- `bun run eval:real`
- `bun run validation:run`

目前 `src/app/main.ts` 之外没有其他支持的根级入口点。

## 子系统分类

### 主要

- `src/app`
  引导逻辑和入口点所有权
- `src/runtime`
  运行时执行基座、守护进程/服务层、graph 和验证流程
- `src/interface`
  TUI 渲染和面向运行时的 client/kernel 适配器
- `src/kernel`
  会话和线程编排边界
- `src/persistence`
  持久化 stores、checkpoint 和 SQLite 实现
- `src/control`
  策略、任务、工具和 worker 协调
- `src/domain`
  核心实体和生命周期规则
- `src/shared`
  配置和小型共享原语

### 次要

- `src/eval`
  确定性内部评估工具
- `src/real-eval`
  实时或追踪支持的评估工具
- `src/validation`
  面向评估后端的正式验证封装
- `src/infra`
  模型网关和提供者支持工具

### 冻结 / 噪音候选

- 非运行时主轴的占位符或重复入口面
- 与稳定术语竞争的设计词汇：
  `thread`、`run`、`task`、`tool`、`approval`、`runtime`

## 次要通道含义

- `eval`
  内部确定性质量工具，不是主要用户产品路径
- `real-eval`
  内部实时或追踪支持场景的质量工具
- `validation`
  内部治理和发布质量的评估工具封装

这些通道必须保持可运行，但不得重新定义产品架构。

## 噪音与简化说明

- 之前的根级 `index.ts` 是一个虚假入口面，已从仓库中移除。
- 之前的 `docs/` 树已被根级控制文档取代。
- 后续清理应继续移除非运行时主轴的虚假入口文件、重复叙述和占位符封装。

## 未来变更控制门槛

在接受任何非平凡的 AI 辅助变更之前，记录：

1. 哪个主要子系统发生变更
2. 哪个入口点或脚本受影响
3. 哪些测试证明变更有效
4. 是否引入新概念、复制现有概念或扩大设计词汇
5. `CONTROL.md` 是否必须变更或编辑明确属于本地

如果变更无法清晰回答这五个问题，则不应合并。

## 二次清理清单

对于未来的清理工作，将变更精确分类为以下之一：

- 权威清理
- 入口面清理
- 子系统边界清理
- 本地实现变更

如果变更是 `权威清理` 或 `入口面清理`，记录：

1. 被降级或移除的来源
2. 存活的权威来源
3. 证明被移除或重写的面不在运行时主轴上
4. 用于验证没有行为退化的测试或检查

这可以防止清理工作变成另一轮不受控制的重写。
