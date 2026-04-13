# Coding Workflow

本文档定义 AI 在 OpenPX 中进行代码修改时的默认工作流。

## 默认进入顺序

开始改代码之前，默认先读：

1. [AGENTS.md](/Users/chenchao/Code/ai/openpx/AGENTS.md)
2. [CONTROL.md](/Users/chenchao/Code/ai/openpx/CONTROL.md)
3. [ARCHITECTURE.md](/Users/chenchao/Code/ai/openpx/ARCHITECTURE.md)

如果仍然需要系统背景，再进入：

4. [docs/space/index.md](/Users/chenchao/Code/ai/openpx/docs/space/index.md)
5. [docs/space/understanding/index.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/index.md)

## 动手前必须明确的 4 件事

在接受任何非平凡改动前，至少明确：

1. 受影响的主要子系统
2. 受影响的入口点或脚本
3. 证明变更有效的测试或验证命令
4. 是否需要回写根级文档

如果这四件事答不清，不应直接进入实现。

## 默认工作流

### 1. 先确认主路径

优先确认改动是否位于：

- 产品主路径
- 次要工具通道
- 或纯本地辅助层

不要在不确认位置的情况下直接编辑大文件。

### 2. 小步改动

默认优先：

- 先抽支持逻辑
- 再抽生命周期或桥接层
- 最后才考虑更大的结构调整

不要优先做一次性大重写。

### 3. 优先代码事实

文档只能辅助理解，不能压过：

1. 运行行为
2. 测试
3. 代码

### 4. 术语保持稳定

优先使用这些稳定词汇：

- `thread`
- `run`
- `task`
- `tool`
- `approval`
- `runtime`

不要在实现过程中重新发明平行词汇。

### 5. 稳定结论必须回写

如果在改动过程中确认了这些稳定结论，必须同步回写根级文档：

- 主路径结论
- 核心概念边界
- 术语解释
- 职责边界
- 复杂度清单
- 剩余优先级

不要让这些结论只停留在对话里。

## 默认验证命令

### 主路径改动

至少运行：

```bash
bun run typecheck
bun test
```

### 主入口 / runtime / TUI 改动

优先补充运行相关切片，例如：

```bash
bun test tests/app/bootstrap.test.ts tests/app/main-entrypoint.test.ts
```

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/confirmation-flow.test.tsx tests/interface/app-screen-view.test.ts
```

### 评估相关改动

优先补充：

```bash
bun test tests/real-eval/runner.test.ts tests/validation/cli.test.ts
```

## 对 `generated/` 和 `references/` 的态度

- `references/`
  只作为外部参考资料
- `generated/`
  只作为派生材料

默认都不直接作为长期权威。

## 当前阶段最重要的约束

OpenPX 当前阶段最重要的不是继续铺功能，而是：

- 保持 runtime 真相边界稳定
- 保持 TUI 不成为第二套状态机
- 保持结构减法是小步、可验证、可回写的
