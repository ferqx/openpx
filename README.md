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
bun run runtime:gc --help
bun run src/app/main.ts --help
bun run smoke:planner
```

预期结果：

- `bun test` 通过
- `bun run typecheck` 通过
- `bun run runtime:gc --help` 打印清理命令帮助并退出
- `bun run src/app/main.ts --help` 打印使用说明并退出，不启动 TUI
- `bun run smoke:planner` 在配置了 `openpx.jsonc` 的 provider 与 model 槽位后直接调用 planner 模型并打印真实摘要；预计会产生一次真实模型调用，本地使用通常在数秒到 1 分钟内完成

`smoke:planner` 当前只验证 planner 连通性，不再绕完整的 run-loop。

如果本机残留了失效的本地代理（例如 `http_proxy=http://127.0.0.1:7890` 但端口未启动），
`smoke:planner` 会先尝试识别并临时绕过该代理，再给出更明确的失败原因。
如果仍失败，优先检查：

- 本地代理是否真的在监听
- `provider.<id>.baseURL` 是否可直连
- 当前环境是否能解析目标模型域名

## SQLite 数据

默认情况下，应用使用内存中的 SQLite 启动用于开发。

要在使用 `bun run dev` 时持久化本地状态，请先设置 `OPENPX_DATA_DIR` 为 SQLite 文件路径：

```bash
OPENPX_DATA_DIR=./.openpx/agent.sqlite bun run dev
```

该路径同时用于应用 stores 与 run-loop 状态持久化。

如需显式清理超出保留窗口的 run-loop 审计记录，可执行：

```bash
bun run runtime:gc
```

当前默认保留窗口为 7 天；启动 runtime 时也会做一次轻量 GC（垃圾回收）。

## Config System

OpenPX v1 的正式配置入口已经切到分层 JSONC：
并且只会读取用户目录 `.openpx` 与项目目录 `.openpx` 里的配置文件。
当前项目尚未正式发版，因此不提供历史配置结构兼容；不符合当前 schema 的旧配置会被视为无效配置。

- user：
  Linux / macOS：`~/.openpx/openpx.jsonc`
  Windows：`%USERPROFILE%\\.openpx\\openpx.jsonc`
- project：`<workspaceRoot>/.openpx/openpx.jsonc`
- project-local：`<workspaceRoot>/.openpx/settings.local.jsonc`

CLI 第一次真正启动时，如果用户级配置不存在，会自动初始化对应平台下的用户配置骨架文件，便于后续直接在全局配置里补全 provider。

推荐在主配置里写：

- provider map 里的 `apiKey` / `baseURL`
- `model.default` / `model.small`
  其中 `model.small` 可选；如果省略或显式设为 `null`，运行时统一回落到 `model.default`
- timeout / retry
- permission mode
- `ui.tui` 偏好

能力对象（agents / skills / tools）通过目录发现：

- Linux / macOS：`~/.openpx/{agents,skills,tools}`
- Windows：`%USERPROFILE%\\.openpx\\{agents,skills,tools}`
- `<workspaceRoot>/.openpx/{agents,skills,tools}`

仓库内仍保留 [schemas/config-v1.json](/Users/chenchao/Code/ai/openpx/schemas/config-v1.json) 作为本地 schema 产物，但当前默认不会自动写入 `$schema`，等正式地址可用后再恢复：

## Planner 模型配置

OpenPX 的模型配置现在只从全局或项目配置文件读取，`.env` 中的 `OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL / OPENPX_THINKING` 不再生效。

推荐的用户级配置示例：

```jsonc
{
  "provider": {
    "openai": {
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1"
    },
    "groq": {
      "apiKey": "gsk-...",
      "baseURL": "https://api.groq.com/openai/v1"
    }
  },
  "model": {
    "default": {
      "provider": "openai",
      "name": "gpt-5.4"
    },
    "small": {
      "provider": "groq",
      "name": "llama-3.1-8b-instant"
    }
  },
  "runtime": {
    "thinkingLevel": "medium"
  }
}
```

项目共享配置写 `<workspaceRoot>/.openpx/openpx.jsonc`，项目本地覆盖写 `<workspaceRoot>/.openpx/settings.local.jsonc`。
`.env.example` 只保留非模型类提示，不再作为模型配置模板。

如果你依赖本地代理访问模型，请确保代理进程先于 `bun run smoke:planner` 和 `bun run dev` 启动；
否则建议暂时清掉 `http_proxy` / `https_proxy`，避免把模型连通性问题误判成应用问题。

## 审批

审批受策略控制。当工具调用存在风险时，内核会创建待定审批请求而不是执行更改。TUI 在启动时水合最新的阻塞线程，支持使用 `/approve <approval-id>` 和 `/reject <approval-id>` 继续或取消阻塞的操作。

## 恢复合同

当前 v1 的 run-loop 恢复语义固定如下：

- `waiting_approval` 是唯一允许自动恢复的边界。系统只承诺恢复事务已落盘、且下一步尚未产生新副作用。
- `plan / execute / verify / respond` 不承诺任意边界的自动精确续跑。只读步骤可安全重试，但不会被自动续跑。
- 只要 execution ledger（执行账本）显示副作用结果不确定，系统就会把当前 run 明确转成 `human_recovery`。
- `human_recovery` 不能自动退出，只能通过公开恢复动作解除：`restart_run`、`resubmit_intent`、`abandon_run`。
- `cancel` 会中止当前 run，并失效该 run 关联的 active suspension、created continuation 与 pending approval；之后旧审批不能再复活已取消的 run。

当前默认 TUI 仍以审批面板为主；恢复动作已经进入 harness protocol（协议层）与 runtime 命令面，便于 CLI、Web、IDE 等后续 surface 复用。
