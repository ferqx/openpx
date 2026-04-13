# Tech Debt Tracker

本文档记录 OpenPX 当前已经确认存在、但暂时不在本轮处理范围内的技术债。

它不是抱怨清单，也不是第二份路线图。  
它只回答三件事：

1. 当前确认存在什么复杂度热点
2. 为什么现在不处理
3. 如果继续推进，下一轮从哪里开始

## 当前技术债分类

### A. 复杂度热点

这些文件仍然可运行，但理解成本偏高，后续应继续做小步结构减法。

#### `src/kernel/session-kernel.ts`

- 当前状态：稳定命令边界已经形成，但摘要、投影和辅助逻辑仍然偏集中
- 为什么暂不处理：刚完成 `bootstrap.ts` 和 `app.tsx` 的一轮收口，应该先让主路径稳定
- 下一轮切入点：优先抽摘要/投影辅助逻辑，不动 `handleCommand` 的公共中心

#### `src/runtime/service/runtime-command-handler.ts`

- 当前状态：协议命令路由与 worker 命令协调还混在一起
- 为什么暂不处理：它和 kernel、runtime-scoped-session 联动较强，应该晚于 `session-kernel`
- 下一轮切入点：区分产品主路径命令与 worker 特定命令

#### `src/runtime/service/runtime-scoped-session.ts`

- 当前状态：active thread 查找、快照组装、事件重放、订阅生命周期都压在一起
- 为什么暂不处理：它是运行时读取模型中心，过早拆分容易打散当前稳定视图合约
- 下一轮切入点：在 snapshot / view 合约进一步稳定后，再考虑分离读取与订阅辅助

### B. 次要工具面重复

这些表面当前仍然必要，但会扩大可见命令面或入口面。

#### `src/eval/run-suite.ts`
#### `src/real-eval/run-suite.ts`
#### `src/validation/run-suite.ts`

- 当前状态：都是单薄 CLI 壳层
- 为什么暂不处理：`package.json` 脚本和测试仍直接依赖
- 当前原则：冻结为次要工具面，不把它们重新叙述成产品主架构入口

#### `package.json` 次要脚本

- 当前范围：`eval:core`、`eval:suite`、`eval:review`、`eval:real`、`validation:run`、`smoke:planner`
- 为什么暂不处理：它们仍是支持的内部工具通道
- 当前原则：保留可运行，但在文档中明确归类为 `secondary`

## 已完成的恢复期清理

下面这些内容已经完成，不再单独保留恢复期清单文档：

- 已移除虚假的根入口面 `index.ts`
- 仓库权威已经收口到根级控制文档与 `docs/space/`
- 遗留的旧 `docs/` 树已经淘汰
- `bootstrap.ts` 与 `app.tsx` 的第一轮结构减法已经完成

## 当前不纳入的债务

下面这些内容当前不放进技术债跟踪：

- 还没有代码证据支持的抽象不满
- 纯风格偏好
- 没有测试或运行行为支撑的“也许应该这样”

如果一条技术债不能落回代码位置、运行边界或验证方式，就先不要写进来。

## 下一轮优先级

如果继续做结构减法，下一轮默认顺序是：

1. `src/kernel/session-kernel.ts`
2. `src/runtime/service/runtime-command-handler.ts`
3. `src/runtime/service/runtime-scoped-session.ts`

短期内不应重新把优先级拉回：

- `src/app/bootstrap.ts`
- `src/interface/tui/app.tsx`

因为这两块已经完成一轮有效收口，应先让新边界稳定。

## 与其他文档的关系

- 本文档现在同时承担：
  - 当前确认但暂不处理的技术债
  - 恢复期复杂度热点的简要历史沉淀
- 如果某项债务开始进入执行，就应转入：
  - `docs/space/execution/active/`
  - 或相应执行计划
