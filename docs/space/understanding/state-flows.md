# State Flows

本文档只记录当前主路径里最重要的状态流转。

## 1. 用户提交输入

主路径：

1. TUI 输入进入 `remote-kernel`
2. `runtime-command-handler` 将命令归一成 `submit_input` 或 `plan_input`
3. `session-kernel` 解析当前 thread/run/task/approval 上下文
4. `controlPlane.startRootTask(...)` 真正推进执行

关键点：

- TUI 不直接推进 graph
- kernel 负责稳定命令边界
- control plane 负责真正推进执行

## 2. 新建执行

当 `startRootTask(...)` 走新执行路径时，会依次：

1. 创建 `Run`
2. 将 `Run` 置为 `running`
3. 创建根 `Task`
4. 将 `Task` 置为 `running`
5. 调用 `rootGraph.invoke(...)`

## 3. 等待审批

如果 graph 执行期间产生 pending approval 或 interrupt：

- `Task` 变为 `blocked`
- `Run` 变为 `waiting_approval`

这时系统对外暴露的是：

- thread 有待审批动作
- 当前 task 被阻塞
- UI 出现 approval 面板

## 4. 批准后恢复

入口：`approve_request`

当前有两条恢复路径：

- 如果存在 checkpoint（检查点）
  - 系统继续走 graph resume（恢复继续执行）
- 如果没有 checkpoint
  - 系统直接执行已经批准的 tool request（工具请求）

共同目标：

- 继续推进当前 `Run`
- 更新 `Task` / `Run` 的完成状态

关键约束：

- 批准恢复时，除了 `resume` 结构体本身，还必须保留 `approval_request_id` 的上下文，避免已批准动作再次掉回等待审批

## 5. 拒绝后恢复

入口：`reject_request`

如果存在 checkpoint：

1. 当前 task 会先结束
2. 系统构造“拒绝该动作后的原因”
3. 再次调用 `startRootTask(...)`
4. 进入重新规划（replan）路径

关键点：

- reject 不是简单终止
- reject 会把“拒绝原因”重新带回规划链路

## 6. interrupt / hydrate

### interrupt

- 含义：人为停止当前 run 的推进
- 作用：终止当前执行流，而不是重写业务真相

### hydrate

- 含义：从持久化状态恢复当前 session 视图
- 作用：把 runtime 中已经存在的真相重新投影给 TUI

关键点：

- hydrate 不是重新生成业务状态
- hydrate 应与 replay / runtime truth 一致
