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

这时系统对外暴露的是：

- thread 有待审批动作
- 当前 task 被阻塞
- UI 出现 approval 面板

## 4. 批准后恢复

入口：`approve_request`

当前有两条恢复路径：

- 如果存在 run-loop suspension（挂起记录）
  - 系统消费 continuation（继续执行信封），从挂起步骤继续推进
- 如果没有 suspension
  - 系统直接执行已经批准的 tool request（工具请求）

共同目标：

- 继续推进当前 `Run`
- 更新 `Task` / `Run` 的完成状态

关键约束：

- 批准恢复时，必须保留 `approvalRequestId` 的上下文，避免已批准动作再次掉回等待审批

## 5. 拒绝后恢复

入口：`reject_request`

如果存在 suspension：

1. 当前 run-loop 消费 rejection continuation
2. 系统构造“拒绝该动作后的原因”
3. 从 planner 步骤重新进入规划（replan）路径

关键点：

- reject 不是简单终止
- reject 会把“拒绝原因”重新带回规划链路

## 6. interrupt / hydrate

### suspension / continuation

- suspension：暂停执行并保存恢复锚点
- continuation：描述“为什么以及如何继续”的结构化输入

### hydrate

- 含义：从持久化状态恢复当前 session 视图
- 作用：把 runtime 中已经存在的真相重新投影给 TUI

关键点：

- hydrate 不是重新生成业务状态
- hydrate 应与 replay / runtime truth 一致
