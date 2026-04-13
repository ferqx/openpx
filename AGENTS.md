# openpx 项目指南

面向长时代码工作的 CLI 优先 Agent OS。基于 Bun、React (Ink) 和 LangGraph 构建。

## 规划基线
- `CONTROL.md` 是权威控制构件和默认文档权威。
- `ARCHITECTURE.md` 是架构导航页，但不覆盖 `CONTROL.md`。
- `ROADMAP.md` 是路线图入口，但不覆盖 `CONTROL.md`。
- 实现和规划必须遵循此真相层级：
  运行行为 / 测试 / 代码 > `CONTROL.md` 中的白名单文档 > 其他一切。
- OpenPX 当前采用“根级控制文档 + `docs/space/` 官方知识空间”的文档模型。
- 不要重建平行的 `docs/` 架构或规划权威；只有通过索引进入的 `docs/space/` 才是官方知识空间。
- 默认阅读顺序：
  `AGENTS.md -> CONTROL.md -> ARCHITECTURE.md -> docs/space/index.md`

## 核心命令
- **运行 TUI**：`bun run dev`（启动共享运行时并附加高保真 shell）
- **运行测试**：`bun test`（完整 suite，包括 domain、persistence 和 runtime 测试）
- **类型检查**：`bun run typecheck` 或 `bunx tsc --noEmit`
- **烟雾测试**：`bun run smoke:planner`（验证 planner 模型连接）

## TypeScript 规则
- 不要在项目代码中使用 `any`。
- 不要引入 `as any` 转换来绕过类型系统。
- 触碰现有文件时，在变更范围内移除附近的 `any` 用法。
- 优先使用 `unknown`、显式联合、泛型、`z.infer<>` 或小型局部接口，而非松散的占位符类型。
- Protocol、kernel、runtime 和 TUI 状态层不能依赖 `any`。

## 语言规则
- 所有新增或更新的代码注释默认使用中文。
- 所有新增或更新的仓库文档内容默认使用中文。
- 只有在外部协议、第三方接口字段、标准名称或必须保留英文原文的场景下，才允许保留英文术语；必要时应辅以中文说明。
- 新增或更新的技术说明中，术语首次出现时必须给出中文对应或中文解释，避免只写英文术语不解释。
- 如果一个文件必须保留英文类名、函数名、协议字段名，应在附近注释或文档里说明它在当前项目语境中的中文含义。

## 文档职责边界
- `AGENTS.md` 只负责 agent 行为规则、语言规则、编码约束和默认工作流。
- 系统结构、模块边界和阅读路径请看 `ARCHITECTURE.md`。
- 核心术语、主路径和状态流请按索引进入 `docs/space/understanding/`。
- 不要把 `AGENTS.md` 扩写成系统百科或第二份架构文档。

## 开发工作流
- 提交前始终使用 `bun test`。
- 新 domain 或 runtime 功能遵循 TDD。
- 更改协议类型时更新 `api-schema.ts`。
- 将 no-`any` 规则视为硬项目约束，而非清理愿望清单。
- 当入口点、脚本分类、子系统所有权或文档白名单更改时，保持 `CONTROL.md` 准确。
- 对于主路径、核心概念、术语对照、职责边界这类已经确认稳定的理解性结论，必须及时回写到根级文档，不能只停留在对话里。
- 对话中产生的稳定解释性内容也视为项目知识的一部分；如果它能帮助后续理解代码、界面、状态流转或术语含义，就必须整理并同步到根级文档。
- `docs/space/` 只通过索引进入，不默认全量扫描。
- `docs/space/generated/` 与 `docs/space/references/` 默认降权，不直接作为长期权威。
- 在接受任何非平凡的 AI 辅助变更之前，记录：
  受影响的主要子系统、受影响的入口点/脚本、证明测试、词汇影响，以及 `CONTROL.md` 是否必须变更。
