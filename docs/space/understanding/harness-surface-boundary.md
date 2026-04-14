# Harness Surface Boundary

这份文档说明默认 TUI surface 的三层职责边界，并明确哪些职责不能回流到 harness core。

## TUI Protocol Client

文件：

- `src/surfaces/tui/runtime/runtime-client.ts`

职责：

- 调用 `/snapshot`
- 调用 `/commands`
- 订阅 `/events`
- 校验 protocol version（协议版本）

非职责：

- 不持有 thread truth（线程真相）
- 不做 task / run / approval 生命周期决策

## TUI Remote Kernel Adapter

文件：

- `src/surfaces/tui/runtime/remote-kernel.ts`

职责：

- `snapshot -> RuntimeSessionState`
- `protocol events -> TuiKernelEvent`
- `TUI commands -> harness commands`
- 连接重试与事件循环

非职责：

- 不直接改动 durable stores（持久存储）
- 不直接拥有 harness core 状态

## TUI App Shell

文件：

- `src/surfaces/tui/app.tsx`

职责：

- 输入导航
- pane / settings / stream display
- exit confirmation（退出确认）
- hydrate on mount（挂载时恢复）
- local UI state（本地界面状态）

非职责：

- 不定义 protocol
- 不定义 thread truth
- 不承担 recovery / approval / artifact truth 规则
