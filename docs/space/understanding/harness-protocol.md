# Harness Protocol

本文档说明 OpenPX 在 harness-first 语境下的 protocol（协议层）最小职责。
这里先给命名和边界，不在本阶段展开到传输细节或字段级 schema。

## command

command 是 surface 发给 harness 的稳定动作入口。

它至少应覆盖：

- 用户提交输入
- 任务规划或执行推进
- approval 的批准与拒绝
- interrupt、resume、hydrate 等恢复动作
- `restart_run`、`resubmit_intent`、`abandon_run` 这类显式人工恢复动作
- surface 需要的会话级控制命令

command 的职责是表达“要做什么”，而不是让 surface 直接改写真相状态。

## snapshot

snapshot 是 harness 返回给 surface 的 projection（投影视图）。

它的职责是：

- 提供当前 thread / run / task / approval 的可消费视图
- 为 TUI、CLI、Web、IDE 提供统一读模型
- 支持新 surface 在不理解全部内部细节的情况下附加到会话

snapshot 必须被当作 projection，而不是 durable truth。

## event stream

event stream 是 harness 向外发布过程变化的连续通道。

它的职责是：

- 让 surface 订阅状态变化
- 提供 live update（实时更新）而不依赖轮询式重建
- 支撑 run 推进、approval 出现、恢复继续、任务完成等过程感知

event stream 负责传播变化，不负责重新定义真相。

## approval action

approval action 是 protocol 中必须稳定暴露的一组动作。

它至少应支持：

- 查看待批动作
- 批准请求
- 拒绝请求
- 在恢复语义下继续推进当前 run

approval action 的意义在于把“人工确认”纳入 harness 真相流程，而不是把它下放成某个 surface 的局部按钮逻辑。

## recovery / replay

recovery / replay 负责让 harness 在中断、恢复、重放时保持可解释性。

它至少涉及：

- interrupted run 如何恢复
- waiting approval 如何继续推进
- human recovery 如何被显式解除
- hydrate 后如何重建当前会话视图
- replay 时哪些事件只是重现，哪些动作会真正落地

恢复协议的目标不是隐藏复杂度，而是稳定表达恢复边界。

当前 v1 额外要求：

- 自动恢复只允许发生在 `waiting_approval`
- `human_recovery` 不可自动退出
- 旧客户端即使不认识 `resumeDisposition` 或 `loop.*` 事件，也必须还能按当前 run 投影视图稳定渲染

## surface adapter responsibility

surface adapter（表面适配层）的职责只有三类：

- 把用户交互翻译成 protocol command
- 消费 snapshot 与 event stream
- 在本地组织显示状态、输入状态和渲染逻辑

surface adapter 不负责：

- 直接定义 thread 真相
- 直接持有 approval 最终语义
- 绕过 protocol 修改 harness 内部状态

因此，新增 surface 的正确做法是先补 protocol 契约，再补 adapter，而不是复制一套内部执行循环。
