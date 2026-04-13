# OpenPX 噪音候选

本文档是第三次恢复操作的清单。

它不是另一个设计权威。  
仅在与 `CONTROL.md` 一起使用时，用于决定降级、删除或冻结什么。

## 当前目标

区分三类仓库噪音：

1. 已完成的清理
2. 当前必须保持冻结的封装或命令面重复
3. 未来代码面清理候选
4. 即使仍然必要但难以理解的复杂度候选

## 已完成的清理

- 已移除虚假的根入口面 `index.ts`
- 仓库权威收至根级控制文档
- 已淘汰遗留的 `docs/` 树

## 当前候选

### A. 当前必须保留的封装面重复

#### `src/eval/run-suite.ts`
#### `src/real-eval/run-suite.ts`
#### `src/validation/run-suite.ts`

- 当前问题：这些是单薄的 CLI 封装，创建重复的外壳模式
- 运行时影响：对产品路径没有影响，但它们仍是真实的工具入口点
- 当前阻碍：`package.json` 脚本和测试直接调用它们
- 当前行动：保持冻结作为次要工具面
- 未来切割：仅在脚本和测试依赖减少后重新考虑

### B. 次要工具命令面

#### `package.json` 次要脚本

- 包含的脚本：`eval:core`、`eval:suite`、`eval:review`、`eval:real`、`validation:run`、`smoke:planner`
- 当前问题：它们扩大了可见的命令面
- 当前阻碍：它们仍代表支持的内部工具通道
- 当前行动：将它们分类为 `secondary`，而不是 `primary`

### C. 任何重大重构前应理解的复杂度候选

#### `src/app/bootstrap.ts`（约 1134 行）

- 当前问题：此文件混合了引导根、控制面编排、run/task 状态转换、approval retry/reject 处理、graph 调用和辅助工具
- 难以理解的原因：太多生命周期职责集中在一个文件中，因此阅读它需要同时记住大部分运行时
- 当前行动：记录边界的同时保持为事实上的控制面中心
- 当前进展：第一刀已完成，支持性辅助逻辑已抽到 `src/app/control-plane-support.ts`
- 当前进展：第二刀已完成，approval resolution 已抽到 `src/app/control-plane-approval-resolution.ts`
- 当前进展：第三刀已完成，run/task lifecycle 已抽到 `src/app/control-plane-run-lifecycle.ts`
- 当前进展：第四刀已完成，graph bridging 已抽到 `src/app/control-plane-graph-bridge.ts`
- 当前进展：第五刀已完成，app context assembly 已抽到 `src/app/app-context-assembly.ts`
- 未来切割：围绕以下内容拆分为更小的单元：
  - 应用上下文组装（主装配顺序已抽离，后续只需继续收窄依赖注入边界）
  - run/task 生命周期转换
  - approval 解决
  - graph 执行桥接（主流程已抽离，后续只需继续收窄调用上下文）

#### `src/interface/tui/app.tsx`（约 934 行）

- 当前问题：此文件混合了 TUI 事件处理、启动状态、线程切换、对话显示状态、设置状态和会话同步
- 难以理解的原因：它同时作为顶层协调器和详细交互控制器
- 当前行动：保持为顶层 TUI 外壳，但将其视为复杂度热点
- 当前进展：第一刀已完成，状态支持逻辑已抽到 `src/interface/tui/app-state-support.ts`
- 当前进展：第二刀已完成，会话同步层已抽到 `src/interface/tui/app-session-support.ts`
- 当前进展：第三刀已完成，输入分发层已抽到 `src/interface/tui/app-input-support.ts`
- 未来切割：拆分为更小的协调器用于：
  - 会话同步（主分发逻辑已抽离，后续只需继续收窄输入侧与 launch state）
  - 对话显示状态
  - 启动/工具面板状态
  - 输入处理（主分发逻辑已抽离，后续只需继续收窄 launch state 本地切换）

#### `src/kernel/session-kernel.ts`（约 367 行）

- 当前问题：此文件在概念上处于中心位置，还处理线程摘要、事件发布、后台执行启动、会话投影和命令路由
- 难以理解的原因：命令边界清晰，但支持辅助工具仍然捆绑得太紧密
- 当前行动：保持为稳定的内核边界
- 未来切割：保留 `handleCommand` 作为公共中心，但提取摘要/投影辅助工具集群

#### `src/runtime/service/runtime-command-handler.ts`（约 313 行）

- 当前问题：此文件既是协议命令路由又是 worker 交互协调器
- 难以理解的原因：产品路径命令和 worker 特定命令共享同一表面
- 当前行动：保持为协议转换层
- 未来切割：将核心 thread/run 命令与 worker 管理命令分离

#### `src/runtime/service/runtime-scoped-session.ts`（约 234 行）

- 当前问题：此文件做了正确类型的工作，但它将 active-thread 查找、快照组装、事件重放和订阅生命周期集中在一处
- 难以理解的原因：它是运行时的读取模型中心，因此几个“当前什么是真的？”问题堆积在这里
- 当前行动：保持为权威的 scoped-session 层
- 未来切割：仅在快照/视图合约更加稳定后考虑提取

## 当前剩余优先级

如果继续做结构减法，按下面顺序推进，不要跳着拆：

1. `src/kernel/session-kernel.ts`
   原因：它已经是稳定命令边界，但摘要/投影/辅助逻辑仍然过于集中；这是下一块最适合继续做“小步拆分”的地方。
2. `src/runtime/service/runtime-command-handler.ts`
   原因：它仍然混合产品命令和 worker 命令，容易继续干扰主路径理解。
3. `src/runtime/service/runtime-scoped-session.ts`
   原因：它是 runtime 读取模型中心，但应晚于 kernel/command-handler 处理，避免在视图合约仍未完全稳定时过早拆散。
4. `src/app/bootstrap.ts`
   原因：虽然已经完成五刀，但仍是控制面中心；下一轮只在明确收益足够大时继续收窄。
5. `src/interface/tui/app.tsx`
   原因：经过三刀后已经明显变薄，短期内不应再优先动它，避免连续扰动主界面协调层。

## 未来清理规则

对于实际移除的每个剩余候选，记录：

1. 移除的来源
2. 存活的权威来源或明确的替换行为
3. 证明它在运行时主轴之外
4. 移除后运行的测试或检查
