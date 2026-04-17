# Validation Workflow

本文档定义 OpenPX 当前的验证通道应该如何使用。

它只回答一件事：
在不同类型的改动之后，应该跑哪条验证链，以及结果如何回流到下一步动作。

## 三条验证通道的定位

### `eval`

确定性评估通道。  
适合验证：

- 规则化场景
- 稳定回归
- 不依赖真实交互轨迹的 contract 检查

它的目标是给出噪声较低的基线，而不是模拟完整真实使用过程。

### `real-eval`

真实轨迹评估通道。  
适合验证：

- 更接近真实运行时的任务推进
- approval（审批）/ resume（恢复继续执行）/ reject（拒绝后重规划）这类行为链
- trace（追踪）与 replay（回放）支持的诊断场景

它的目标是暴露真实行为问题，而不是追求最低噪声。

### `validation`

正式验证封装。  
适合验证：

- 多个场景的统一汇总
- capability family（能力族）阈值
- evidence bundle（证据包）与 review queue（复核队列）输出

它的目标不是替代 `eval` 和 `real-eval`，而是把它们包装成更稳定的正式验证层。

## 默认选择规则

### 只改了局部实现，想先做快速确认

优先：

```bash
bun run typecheck
```

然后补对应的局部测试。

如果改动触及确定性评估场景，再补：

```bash
bun test tests/eval/runner.test.ts
```

如果改动触及 planner 连通性、模型基础配置或 provider/代理诊断，再补：

```bash
bun test tests/app/smoke-planner.test.ts
bun run smoke:planner
```

这里的 `smoke:planner` 是 direct planner（直接 planner）烟雾测试，
目标是尽快回答“planner 模型是否真的可连、可返回摘要”，
而不是覆盖完整 run-loop。

### 改动触及 approval、resume、reject、run-loop 推进或 runtime 行为

优先：

```bash
bun test tests/real-eval/runner.test.ts
```

必要时再跑对应的 `eval` 切片，用来判断问题是稳定 contract 退化，还是只出现在真实轨迹里。

### 改动触及正式验证、评估聚合、证据落盘、review queue

优先：

```bash
bun test tests/validation/cli.test.ts
```

必要时再补：

```bash
bun test tests/real-eval/runner.test.ts tests/eval/runner.test.ts
```

### 改动跨越多层

如果同时碰到：

- runtime / kernel / TUI 主路径
- `eval` / `real-eval` / `validation`

不要只跑单一通道。  
至少组合运行：

```bash
bun run typecheck
```

```bash
bun test tests/real-eval/runner.test.ts tests/validation/cli.test.ts
```

根据改动面再补更细的测试切片。

## 跨平台测试兼容

OpenPX 的测试默认应假定会在 Windows、Linux、macOS 上运行。
因此，测试夹具与验证脚本必须遵守下面这些兼容规则，而不能只对当前开发机成立：

1. 路径必须通过 `path.join`、`path.resolve`、`os.tmpdir()` 构造，不能写死 `/tmp/...`、盘符路径或手写分隔符。
2. 临时目录、临时数据库、artifact 目录清理不能直接依赖一次性 `fs.rm(...)` 成功；应优先使用仓库内统一的清理 helper，例如 `tests/helpers/fs-cleanup.ts` 里的 `removeWithRetry(...)`。
3. SQLite、run-state、eval store、app context 这类会持有文件句柄的对象，测试结束前必须显式 `close()`；不能把“删除目录成功”当作资源已经释放的证明。
4. Windows 上常见的 `EBUSY`、`EPERM` 以及 Linux / macOS 上可能出现的瞬时 `ENOTEMPTY`，应视为测试清理阶段的可重试错误，而不是立即判定为产品行为失败。
5. 长耗时测试不能依赖默认超时；像 `eval suite`、`real-eval`、baseline 更新、live sample 这类链路，应在测试文件内显式提高超时预算，避免只在较慢平台上假失败。
6. 基线、snapshot、comparable object 不能保留绝对路径、平台相关路径分隔符、运行时 ID、时间戳等不稳定字段；跨平台比较前必须先做 normalize。
7. 测试不要依赖 bash、PowerShell、zsh 等单一 shell 方言；能用 Node/Bun API 完成的文件系统和进程操作，不应改写成平台特定命令。

当前推荐做法：

- 创建临时目录时统一使用 `os.tmpdir()` + `fs.mkdtemp(...)`
- 清理临时目录时统一使用 `removeWithRetry(...)`
- 打开过的 store / sqlite / app context 在测试内显式关闭
- 长耗时测试文件单独设置更高的 `setDefaultTimeout(...)`
- baseline 比较前统一做路径与运行时字段去噪

## 结果如何回流

验证结果不只是“通过/失败”，还要回答下面的问题：

1. 是主路径行为退化，还是次要工具通道退化
2. 是确定性 contract 失败，还是只在真实轨迹里失败
3. 是代码实现问题，还是文档/索引/验证规则本身需要更新

如果失败落在：

- `eval`
  优先检查规则化场景、摘要断言、稳定 contract
- `real-eval`
  优先检查状态流、审批恢复、真实 trace
- `validation`
  优先检查场景装配、证据落盘、聚合报告和白名单文档入口

## 不该做的事

- 不要把 `validation` 当成新的产品主架构
- 不要一次改完实现后只跑一条验证通道
- 不要用 generated 报告替代代码事实和测试事实
- 不要在验证失败后直接扩写文档来掩盖实现问题

## 当前阶段的建议

OpenPX 现在最重要的验证目标不是“覆盖一切”，而是：

- 保持主路径可运行
- 保持 `real-eval` 与 `validation` 这两条次要工具通道不漂移
- 在每次结构减法后，用最小但有代表性的验证集确认没有把系统读写边界打坏
