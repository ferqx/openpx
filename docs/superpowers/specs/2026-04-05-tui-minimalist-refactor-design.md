# 规格说明书：TUI 极简重构与性能优化

## 1. 问题背景

当前 openpx 的 TUI 存在两个主要问题：
1. **界面杂乱**：包含过多的面板（如 ThreadPanel、InteractionStream 等），使用了冗余的标签（如 "Agent:"、"Changes:"），视觉噪声大，不符合生产力工具的直观感。
2. **响应延迟严重**：在 TUI 提交任务后，后端会同步等待 LangGraph 完整执行（通常需要 50 秒以上）才返回响应，导致 TUI 界面长时间卡死，无法提供即时反馈。

## 2. 设计目标

- **极简 UI**：参考 `claude-code` 和 `codex` 的设计风格，移除冗余布局，专注于命令交互流。
- **即时响应 (< 1s)**：将任务执行改为异步模式。提交任务后立即返回，通过 SSE 事件流实时更新 UI 状态。
- **状态透明**：清晰展示 "Thinking"、"Executing Tool" 等中间状态，消除用户等待时的焦虑。

## 3. 架构方案：异步命令处理

### 3.1 核心变更

- **SessionKernel 异步化**：`handleCommand` 将不再等待 `controlPlane.startRootTask` 的 Promise 完成。它将启动后台执行，并立即返回当前线程的初始状态及任务引用。
- **事件驱动更新**：TUI 订阅的 `/events` (SSE) 接口将成为 UI 更新的核心动力。Graph 执行过程中的每一步（`task.created`、`tool.start`、`answer.updated`）都将作为事件推送到 TUI。
- **任务状态追踪**：TUI 维护一个 `activeTaskId`，若当前有后台任务正在运行，则在输入框上方显示动画加载状态（Thinking/Responding）。

### 3.2 数据流向

1. **TUI** 发送 `POST /commands { kind: "add_task", content: "..." }`。
2. **RuntimeCommandHandler** 调用 `SessionKernel.handleCommand`。
3. **SessionKernel** 创建任务，触发后台 Graph 运行，并立即返回 `202 Accepted`。
4. **TUI** 接收到响应，立即恢复输入框交互（或切换为任务运行状态）。
5. **Graph** 在后台运行，通过 `EventBus` 发送实时事件。
6. **SSE 隧道** 将事件推送至 TUI。
7. **TUI** 增量更新 `InteractionStream`，展示工具执行和回复片段。

### 3.3 性能追踪与延迟区分

为了提高透明度，系统将区分并展示以下两个核心时间指标：

- **Service Latency (服务响应延迟)**：从用户提交指令到后端服务确认接收并成功调用模型 API 的时间（反映网络、排队、冷启动等基础设施延迟）。
- **Model Generation Time (模型推理时间)**：从模型开始推理到完成最后回复的时间（反映模型的推理速度和回复长度）。

#### 实现逻辑：
- **Backend**: 在 `EventBus` 中引入阶段性打点：
  - `model.invocation_started`: 开始请求外部模型服务。
  - `model.first_token_received`: 接收到首个输出（标记生成阶段开始）。
  - `model.completed`: 回复完成。
- **Frontend (TUI)**: 
  - 状态栏或 `InteractionStream` 将动态显示这两个指标。
  - 例如：`● Thinking... (Wait: 1.2s | Gen: 5.4s)`

## 4. UI 组件重构

### 4.1 布局调整 (Screen.tsx)
- **隐藏 ThreadPanel**：默认不再显示线程列表面板，仅通过 `/threads` 命令手动呼出。
- **简化 Header**：将项目路径和版本号压缩至一行，减少垂直空间占用。
- **移除边框**：移除主体交互区的边框，使文本自然流动。

### 4.2 交互流优化 (InteractionStream.tsx)
- **移除标签**：移除 "Agent:"、"Changes:" 等硬编码标签。
- **提示符强化**：使用 `❯` (theme.symbols.prompt) 明确区分用户输入。
- **工具流弱化**：将 `Executing {tool}...` 使用暗灰色显示，并缩进，使其作为辅助信息。
- **流式回复**：支持 `answer.updated` 事件，实现类似 ChatGPT 的逐字或逐段回复效果。

### 4.3 状态栏压缩 (StatusBar.tsx)
- 仅保留：`PROJECT_NAME | THREAD_ID | MODEL_STATUS | RUNTIME_STATUS`。
- 模型状态增加计时器（例如：`Thinking (5s)`）。

## 5. 验证标准

- [ ] 提交任务后，TUI 响应时间必须小于 500ms（不计算网络延迟）。
- [ ] 界面在 80 列宽度下不应出现明显的挤压或重叠。
- [ ] 工具执行状态必须以非阻塞方式在流中显示。
- [ ] 完成重构后，UI 风格应与 `claude-code` 保持高度一致。

## 6. 风险与权衡

- **并发处理**：异步模式下需处理用户在任务运行时重复提交的情况（应予以阻止或排队）。
- **SSE 可靠性**：若 SSE 连接中断，TUI 需通过 `hydrateSession` 进行状态同步补偿。
