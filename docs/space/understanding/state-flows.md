# State Flows

本文档只记录当前主路径里最重要的状态流转。

## 1. 用户提交输入

主路径：

1. TUI 输入进入 `remote-kernel`
2. `runtime-command-handler` 将命令归一成 `submit_input` 或 `plan_input`
3. `session-kernel` 解析当前 thread/run/task/approval 上下文
4. `controlPlane.startRootTask(...)` 真正推进执行

关键点：

- TUI 不直接推进 run-loop
- kernel 负责稳定命令边界
- control plane 负责真正推进执行

## 2. 新建执行

当 `startRootTask(...)` 走新执行路径时，会依次：

1. 创建 `Run`
2. 将 `Run` 置为 `running`
3. 创建根 `Task`
4. 将 `Task` 置为 `running`
5. 调用 run-loop engine 推进 plan / execute / verify / respond

## 3. 等待审批

如果 run-loop 执行期间产生 pending approval 或 suspension（挂起）：

- `Task` 变为 `blocked`
- `Run` 变为 `waiting_approval`
- `run_loop_state` 会在当前 step 边界落盘
- `run_suspension` 会以 `active` 状态保存审批恢复锚点

这时系统对外暴露的是：

- thread 有待审批动作
- 当前 task 被阻塞
- UI 出现 approval 面板

## 4. 批准后恢复

入口：`approve_request`

当前 v1 只有一条正式自动恢复路径：

- 系统必须精确加载 `runId` 对应的 active suspension
- continuation（继续执行信封）必须带完整归属链；`approval_resolution` 必须携带 `threadId`、`runId`、`taskId`、`approvalRequestId`
- suspension 只能从 `active -> resolved` 一次
- continuation 只能从 `created -> consumed` 一次
- 事务提交之后，run-loop 才会继续推进

关键约束：

- 自动恢复只允许发生在 `waiting_approval`
- 恢复事务只承诺到“下一步尚未产生新副作用”
- 重复 approve / reject / continuation 只返回当前 run 投影视图，不再次推进 loop

如果恢复事务发现 continuation 已消费、suspension 已失效，或者 state 版本不兼容：

- 不再抛裸错给 surface
- 系统返回稳定的 `resumeDisposition`
- 必要时把 run 收口到 `human_recovery`

## 5. 拒绝后恢复

入口：`reject_request`

如果存在 suspension：

1. 当前 run-loop 消费 rejection continuation
2. 系统构造“拒绝该动作后的原因”
3. 从 planner 步骤重新进入规划（replan）路径

关键点：

- reject 不是简单终止
- reject 会把“拒绝原因”重新带回规划链路
- v1 中 reject 的 continuation 同样要经过 CAS（compare-and-set，比较并交换）消费

## 6. human_recovery

当 run 无法安全自动恢复时，系统会明确进入 `human_recovery`。

触发条件包括：

- execution ledger 显示副作用结果不确定
- run-loop state 版本不兼容
- legacy checkpoint 迁移把旧线程收口到人工恢复

v1 合同：

- `human_recovery` 不可自动退出
- 只能通过显式动作解除：
  - `restart_run`
  - `resubmit_intent`
  - `abandon_run`
- 任一解除动作都会让旧 continuation 失效，并发布 `thread.recovery_resolved`

## 7. cancel

当用户取消当前 run 时：

- `running` 中的执行会先 abort（中止）当前控制器，再把 task 标成 `cancelled`
- `waiting_approval` 中的执行会取消 pending approval，并把 active suspension / created continuation 标成 `invalidated`
- run 会统一转成 `interrupted`
- 旧 approval 不得在 cancel 之后继续复活该 run

## 8. interrupt / hydrate

### suspension / continuation

- suspension：暂停执行并保存恢复锚点
- continuation：描述“为什么以及如何继续”的结构化输入

### hydrate

- 含义：从持久化状态恢复当前 session 视图
- 作用：把 runtime 中已经存在的真相重新投影给 TUI

关键点：

- hydrate 不是重新生成业务状态
- hydrate 应与 replay / runtime truth 一致
