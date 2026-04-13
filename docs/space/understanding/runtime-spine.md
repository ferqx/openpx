# Runtime Spine

本文档只回答一个问题：

**OpenPX 当前的产品主路径是什么。**

## 当前主路径

从代码和测试可确认的产品主路径如下：

`package.json -> src/app/main.ts -> src/runtime/service/runtime-daemon.ts -> src/runtime/service/runtime-service.ts -> src/interface/runtime/runtime-client.ts -> src/interface/runtime/remote-kernel.ts -> src/interface/tui/app.tsx`

## 每一层的职责

### `package.json`

- 主要脚本：`bun run dev`
- 它是默认产品启动入口，而不是内部工具脚本

### `src/app/main.ts`

- 产品 CLI/TUI 入口
- 负责启动或连接 runtime，然后挂载 TUI

### `src/runtime/service/runtime-daemon.ts`

- 保证共享 daemon（守护进程）存在
- 决定是复用现有 runtime 还是启动新的 runtime

### `src/runtime/service/runtime-service.ts`

- 负责 runtime service（运行时服务）装配
- 为不同 scope（作用域）组装执行基座

### `src/interface/runtime/runtime-client.ts`

- 连接 TUI 与共享 runtime
- 负责把远程命令和事件送到界面侧

### `src/interface/runtime/remote-kernel.ts`

- 把运行时协议适配成 TUI 可见的 kernel（内核边界）接口

### `src/interface/tui/app.tsx`

- 顶层 TUI 协调器
- 负责连接 session、输入、事件和 screen 视图

## 最小端到端闭环

当前最小闭环是：

1. 用户执行 `bun run dev`
2. `main.ts` 确保 runtime daemon 可用
3. TUI 通过 runtime client 附加到共享 runtime
4. 用户输入经由 remote kernel 进入运行时命令边界
5. runtime 持有状态真相并回推事件、快照和视图

## 哪些不是主路径

下面这些不是产品主架构入口：

- `src/eval/run-suite.ts`
- `src/real-eval/run-suite.ts`
- `src/validation/run-suite.ts`

它们是内部工具入口，不是面向用户的产品启动路径。
