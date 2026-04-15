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
- `bun run smoke:planner` 在配置了 `OPENAI_*` 环境变量时直接调用 planner 模型并打印真实摘要；预计会产生一次真实模型调用，本地使用通常在数秒到 1 分钟内完成

`smoke:planner` 当前只验证 planner 连通性，不再绕完整的 run-loop。

如果本机残留了失效的本地代理（例如 `http_proxy=http://127.0.0.1:7890` 但端口未启动），
`smoke:planner` 会先尝试识别并临时绕过该代理，再给出更明确的失败原因。
如果仍失败，优先检查：

- 本地代理是否真的在监听
- `OPENAI_BASE_URL` 是否可直连
- 当前环境是否能解析目标模型域名

## SQLite 数据

默认情况下，应用使用内存中的 SQLite 启动用于开发。

要在使用 `bun run dev` 时持久化本地状态，请先设置 `OPENPX_DATA_DIR` 为 SQLite 文件路径：

```bash
OPENPX_DATA_DIR=./.openpx/agent.sqlite bun run dev
```

该路径同时用于应用 stores 与 run-loop 状态持久化。

## Planner 模型配置

planner worker 从 `.env` 读取本地 OpenAI 风格的变量：

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=kimi-k2.5
```

将 [`.env.example`](/Users/chenchao/Code/ai/openpx/.env.example) 复制到 `.env` 并填写 provider 特定的值。`.env` 被 gitignore 忽略，保留在本地。

如果你依赖本地代理访问模型，请确保代理进程先于 `bun run smoke:planner` 和 `bun run dev` 启动；
否则建议暂时清掉 `http_proxy` / `https_proxy`，避免把模型连通性问题误判成应用问题。

## 审批

审批受策略控制。当工具调用存在风险时，内核会创建待定审批请求而不是执行更改。TUI 在启动时水合最新的阻塞线程，支持使用 `/approve <approval-id>` 和 `/reject <approval-id>` 继续或取消阻塞的操作。
