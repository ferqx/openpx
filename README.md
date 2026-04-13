# openpx

## 快速入口

当前仓库采用“根级控制文档 + `docs/space/` 官方知识空间”的模型。

默认先读：

1. `AGENTS.md`
2. `CONTROL.md`
3. `ARCHITECTURE.md`

需要更深信息时，再按索引进入 `docs/space/`。

## 安装

```bash
bun install
```

## 运行 TUI

```bash
bun run dev
```

## 运行测试

```bash
bun test
```

```bash
bun run typecheck
```

## 烟雾测试 / 验证

检查开发体验时，按顺序运行以下命令：

```bash
bun test
bun run typecheck
bun run src/app/main.ts --help
bun run smoke:planner
```

预期结果：

- `bun test` 通过
- `bun run typecheck` 通过
- `bun run src/app/main.ts --help` 打印使用说明并退出，不启动 TUI
- `bun run smoke:planner` 在配置了 `OPENAI_*` 环境变量时打印真实的 planner 摘要；预计会产生一次真实的模型调用，本地使用可能需要约 1-2 分钟

## SQLite 数据

默认情况下，应用使用内存中的 SQLite 启动用于开发。

要在使用 `bun run dev` 时持久化本地状态，请先设置 `OPENPX_DATA_DIR` 为 SQLite 文件路径：

```bash
OPENPX_DATA_DIR=./.openpx/agent.sqlite bun run dev
```

该路径同时用于应用 stores 和 LangGraph checkpointing。

## Planner 模型配置

planner worker 从 `.env` 读取本地 OpenAI 风格的变量：

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=kimi-k2.5
```

将 [`.env.example`](/Users/chenchao/Code/ai/openpx/.env.example) 复制到 `.env` 并填写 provider 特定的值。`.env` 被 gitignore 忽略，保留在本地。

## 审批

审批受策略控制。当工具调用存在风险时，内核会创建待定审批请求而不是执行更改。TUI 在启动时水合最新的阻塞线程，支持使用 `/approve <approval-id>` 和 `/reject <approval-id>` 继续或取消阻塞的操作。
