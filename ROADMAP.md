# OpenPX 路线图

本文档只回答四件事：

1. OpenPX 当前阶段在做什么
2. 近中期优先级顺序是什么
3. 当前明确不做什么
4. 具体执行计划应该去哪里看

它是方向入口，不是控制权威，也不是执行细节文档。  
当它与 [CONTROL.md](/Users/chenchao/Code/ai/openpx/CONTROL.md) 冲突时，以 `CONTROL.md` 为准。

## 当前阶段定义

OpenPX 当前阶段不是继续铺功能，也不是优先做多前端产品化。  
当前阶段是把 OpenPX 收敛成一个：

- 可恢复的本地 code agent harness（代码智能体执行底座）
- runtime（运行时）真相边界清晰的系统
- TUI 只消费 protocol（协议）与 snapshot（快照）的系统
- 可验证、可中断、可继续推进的 agent harness

## 近中期优先级

当前固定优先级如下：

1. 执行闭环稳定
2. runtime 真相边界收紧
3. 结构复杂度继续减法
4. hardening（可靠性加固）
5. productization（产品化）

如果前 3 项还没稳定，不应插入新的产品化主线。

## 当前主线目标

### 1. 把 OpenPX 做成稳定的 agent harness

重点包括：

- `thread -> run -> task -> tool -> approval` 这条稳定外部模型
- graph-backed execution loop（图驱动执行闭环）
- approval / reject / resume 的统一执行路径
- runtime 作为唯一真相源

### 2. 保持 TUI 是 shell，不是第二套状态机

重点包括：

- TUI 只消费 runtime view
- 不在界面层重新拼装业务真相
- 保持输入分发、会话同步、屏幕组合三者边界清晰

### 3. 继续做结构减法

当前复杂度热点仍然存在，但已经从“完全失控”进入“可持续小步收口”阶段。  
下一轮优先级仍然是：

1. `src/kernel/session-kernel.ts`
2. `src/runtime/service/runtime-command-handler.ts`
3. `src/runtime/service/runtime-scoped-session.ts`

详细原因见 [docs/space/execution/tech-debt-tracker.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/tech-debt-tracker.md)。

## 当前明确非目标

当前阶段，OpenPX 不优先做：

- 为了“看起来完整”而继续铺新功能
- 多前端接入优先化
- 大规模 UI polish（界面打磨）
- 重新分散业务真相到 TUI、本地 helper 或临时文档
- 新建平行架构词汇或平行控制面

## 执行计划入口

如果要看当前执行计划，不要在 `ROADMAP.md` 里展开。  
请进入：

- [docs/space/execution/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/index.md)
- [docs/space/execution/active/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/active/index.md)
- [docs/space/execution/completed/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/completed/index.md)

如果要看当前默认执行方法，请进入：

- [docs/space/execution/coding-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/coding-workflow.md)
- [docs/space/execution/validation-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/validation-workflow.md)
- [docs/space/execution/refactor-playbook.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/refactor-playbook.md)

## 一句话总结

OpenPX 当前不是在做“更多功能”，而是在把自己收敛成一个可控、可恢复、可验证的 code agent harness。
