# CLAUDE.md

此文件不是 OpenPX 的架构或规划权威。

按以下顺序使用根级文件：

1. `CONTROL.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `ROADMAP.md`

如果此文件与上述任何文件冲突，忽略此文件。

## 残留环境说明

- 主要产品入口：`bun run dev`
- 直接 TUI 入口：`bun run src/app/main.ts`
- 主要验证命令：
  - `bun test`
  - `bun run typecheck`
  - `bun run smoke:planner`

## 次要工具通道

这些是内部工具通道，不是替代产品架构：

- `bun run eval:core`
- `bun run eval:suite`
- `bun run eval:review`
- `bun run eval:real`
- `bun run validation:run`

有关运行时主轴、子系统分类、脚本状态和仓库控制规则，请阅读 `CONTROL.md`。
有关系统结构导航和 `docs/space/` 的进入方式，请阅读 `ARCHITECTURE.md`。
