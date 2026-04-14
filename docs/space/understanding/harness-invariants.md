# Harness Invariants

本文档记录 OpenPX 在 harness-first 语境下的核心 invariant（不变量）。
这些不变量用于约束实现、评测与文档叙事，避免把局部投影误认为系统真相。

## 1. thread is source of truth

thread 是长期协作线的真相锚点。
run、task、approval、artifact 和恢复语义都必须能回到具体 thread 上解释。

这意味着：

- 任何 surface 都不能自己发明一套并行 thread 状态
- 恢复与复盘必须优先从 durable thread 语义出发
- 讨论“当前系统在做什么”时，默认先问 thread 再问 UI

## 2. snapshot is projection

snapshot 是 projection（投影视图），不是 source of truth（真相源）。

这意味着：

- snapshot 可以重建、刷新、替换
- snapshot 用于消费和展示，不用于定义最终运行真相
- 当 snapshot 与 durable state 冲突时，以 durable state 为准

## 3. no side effect before approval

任何需要 approval 的高风险动作，在批准前都不能产生真实副作用。

这意味着：

- approval 不是纯 UI 流程，而是 harness 的执行边界
- tool request 在待批状态下只能被描述、不能被落地执行
- surface 不得通过捷径绕过 approval gate

## 4. no duplicate side effect after recovery

恢复执行不能重复制造已经确认过的副作用。

这意味着：

- resume、hydrate、replay 都必须有明确的恢复边界
- approval 后恢复与 checkpoint 恢复必须遵守幂等或可判定语义
- harness 必须能解释“哪些动作已发生，哪些动作只是待恢复”

## 5. no artifact truth leakage across work packages

artifact truth（产物真相）不能在不同工作包之间发生未声明泄漏。

这意味着：

- 一个 work package 的可见产物边界必须可解释
- derived report（派生报告）不能冒充 durable artifact
- review、eval、promotion 所消费的产物真相必须可追溯

## 6. no surface bypass of protocol

surface 不得绕过 protocol 直接持有或篡改 harness 真相状态。

这意味着：

- surface 只能通过稳定 command、snapshot、event stream、approval action 访问 harness
- 不允许在 surface 内复制一套 thread / run / approval 真相逻辑
- 新 surface 必须复用共享 harness，而不是复制 agent loop

## 使用方式

如果后续实现、评测、协议设计或目录迁移与这些不变量冲突，应优先修正文档叙事和实现边界，而不是放宽不变量定义。
