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

## 项目结构
- `src/app/`：引导逻辑和主要入口点。
- `src/kernel/`：SessionKernel、Command Bus 和 Thread 服务。
- `src/runtime/`：LangGraph 实现（Root Graph 和 Specialized Workers）。
- `src/interface/`：TUI 组件（基于 Ink）和 Runtime Client。
- `src/control/`：策略引擎、任务管理和工具注册表。
- `src/domain/`：核心实体（Thread、Task、Event、Memory）。
- `src/persistence/`：所有端口的 SQLite 实现。
- `src/shared/`：配置、ID 生成器和 Zod schema。

## 技术栈与标准
- **运行时**：Bun 1.x
- **语言**：TypeScript（严格模式）
- **编排**：LangGraph.js
- **UI**：React 19 + Ink 6（高保真 ANSI 输出）
- **数据库**：SQLite（通过 `bun:sqlite`）
- **模型访问**：LangChain OpenAI / ModelGateway
- **API**：本地 HTTP（Control）+ SSE（Events）

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

## 架构原则
1. **运行时优先**：共享运行时是唯一真相源。
2. **持久化恢复**：每个有效工具调用都记录在持久化账本中。
3. **上下文纪律**：三层模型（Narrative、Working、Scratch）防止上下文漂移。
4. **多项目**：线程和运行时按 workspace/projectId 隔离。
5. **人在环中**：高风险操作和团队建议需要明确确认。

## 核心运行时模型
- **Agent**：面向用户的系统，接受目标、决定下一步动作、使用工具并保持工作推进直到完成、阻塞或需要审批。
- **Thread**：一条长期协作线的持久化容器。它保存消息历史、持久化上下文、恢复事实和项目关联。线程在许多执行尝试中保持连续性。
- **Run**：线程内的一次执行实例。Run 从用户请求或恢复操作开始，追踪该特定尝试的生命周期，如 `running`、`waiting_approval`、`blocked` 或 `completed`。
- **Task**：Run 内的工作单元，如检查代码、编辑文件或验证修复。任务是短暂的，应描述当前正在执行的步骤，而非整个对话历史。
- **Tool**：Agent 观察或影响项目环境的唯一方式。文件读取、终端命令、补丁应用和未来外部集成都属于这里。
- **Approval**：不能自动执行的操作的控制面检查点。高风险或状态更改的工具调用必须通过策略和审批才能执行。
- **Runtime**：拥有状态转换、持久化、事件发布、恢复和协议视图的执行基座。TUI 渲染运行时真相，不发明竞争的业务状态。

## Thread、Run 和 Task 边界
- **Thread 回答**："我们在哪条持续的工作线上？"它存储持久的对话上下文，而非每步执行细节。
- **Run 回答**："这次执行尝试现在发生了什么？"它存储一次尝试的生命周期，而非整个长期历史。
- **Task 回答**："Agent 当前正在做什么具体步骤？"它存储步骤级输入、输出和结果摘要，而非完整线程叙述。
- 线程可以跨越许多 Run。Run 可以随着时间包含许多 Task。在 V1 中，优先每个线程一个活动 Run 和每个 Run 一个活动 Task，除非明确设计并行。
- 不要用 thread 代替 task 状态，也不要用 task 作为长期上下文的倾倒场。

## Worker 定位
- `worker` 当前是内部运行时概念，不是主要产品概念。
- Worker 可以作为运行时用来推进任务的执行单元存在，但稳定的外部模型是 `thread -> run -> task -> tool -> approval`。
- `planner`、`executor`、`verifier`、`graph` 和 `node` 是实现机制。它们不能成为用户面向或协议面向行为的主要架构词汇。

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
