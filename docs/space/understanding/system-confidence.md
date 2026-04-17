# System Confidence

这份文档说明 OpenPX 在 M2 阶段如何把 runtime 从“基本能工作”推进到“可证明、可复盘、可回归”的系统。

## 为什么需要 System Confidence

OpenPX 已经是一个 harness-first（以 harness 为先）的 runtime：

- thread / run / task / approval / recovery 构成执行主轴
- event log / execution ledger / run-loop state 构成 durable truth（持久真相）
- snapshot / session projection / TUI 只是表面投影视图

在这个阶段，system confidence（系统置信度）要回答的是：

1. 正常路径是否稳定可重复
2. 异常路径是否可解释、可复盘
3. 新改动是否会把既有语义静默打坏

## M2 的统一入口

M2 不新造第三套 confidence 框架。

当前统一入口固定为：

- `bun run validation:run`

它负责：

- 调度 deterministic eval / real-eval backend
- 在 scenario 执行之后运行 post-run analyzers（运行后分析器）
- 产出 engineering / product gate / scorecard 三种视图

## Scenario 与 Analyzer 的分工

### Scenario backend

scenario backend 只负责把系统跑起来。

当前主入口：

- `src/eval/scenarios.ts`
- `src/eval/scenario-runner.ts`
- `src/harness/eval/real/sample-runner.ts`

它覆盖：

- core flow
- approval / resume
- reject / replan
- cancel / human_recovery
- legacy checkpoint / version mismatch

### Post-run analyzers

post-run analyzers 不重新执行任务，而是消费这次运行留下的证据。

第一版产物包括：

- replay（回放）
- failure report（故障摘要）
- truth diff（真相差异）
- scorecard（置信度评分表）

这些分析器统一读取：

- stores
- execution ledger
- event log
- run-loop state
- snapshot / session projection

## 真相解释模型

M2 固定采用这套解释优先级：

1. stores
   当前生命周期真相
2. execution ledger
   外部副作用确定性真相
3. event log
   时间线真相
4. snapshot / projection
   表面消费视图

如果出现冲突：

- 不静默偏向某一侧
- analyzer 必须产出 inconsistency（不一致）结论
- replay / failure report 必须把冲突暴露出来

## 关键产物

### Replay

用于回答“这次 run 到底怎么走到这里”。

第一版固定输出：

- JSON：机器可消费真相
- Markdown：人类复盘视图

### Failure Report

用于回答“哪里失败了、风险是什么、接下来应该怎么办”。

第一版至少包含：

- threadId / runId / taskId
- failure step
- latest stable status
- approval / recovery 参与情况
- side-effect risk（副作用风险）
- recommendation（建议动作）

### Scorecard

用于回答“当前这批 runtime 行为是否达到发布门槛”。

第一版至少覆盖：

- core scenario success
- approval resume success
- cancel correctness
- human_recovery correctness
- replay / failure report / truth diff coverage
- loop event coverage

## 发布阻断项

下列情形属于 M2 阶段的阻断项：

- core scenario 不稳定
- approval / resume / cancel / human_recovery 缺少可重复场景
- replay / failure report 无法覆盖失败 run
- truth diff 无法识别 durable truth 与 projection 的偏移
- validation gate 无法阻止已知语义退化

## 对贡献者的要求

如果改动影响以下任一项，必须同步更新 confidence 证据：

- scenario matrix
- replay / failure report / truth diff 结构
- validation scorecard / gate 语义
- state flow 文档

M2 不是“多一组测试”；
它是 OpenPX 证明自己真的做对了 runtime contract（运行时合同）的方式。
