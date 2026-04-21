# Agent / Mode / AgentRun 收尾完成记录

> 状态说明：原 `execution/active/agent-mode-agentrun-followup.md` 已完成并归档。本文记录第二阶段收尾的完成事实，不再作为 active 计划保留。

## 当时要解决的问题

第一阶段完成后，仓库已经有了 `Build / threadMode / AgentRun` 的方向性边界，但还需要把下面几件事彻底收口：

- 为 `AgentRun` 建立正式领域与协议类型，而不是只停留在 UI 文案。
- 把 `SubagentSpec` 从名字列表补成可执行合同。
- 为 `Verify` 给出明确的实例化判定规则。
- 把 `plan mode` 的挂起、决策和 continuation 恢复语义写进稳定文档。

## 实际完成

- 新增 `src/domain/agent-run.ts`、`src/control/agents/agent-run-adapter.ts`、`src/control/agent-runs/` 与对应 persistence 端口，使运行实例在领域、控制面、协议和存储层都有正式落点。
- `SubagentSpec` 已具备 `permissionPolicy`、`visibilityPolicy`、`invocationPolicy` 与 `costLabel` 等最小合同字段，并由 registry 统一读取。
- 新增 `src/control/agents/verify-instantiation-policy.ts`，把 Verify 拆成“逻辑子阶段”与“独立 AgentRun”两类稳定规则。
- surface 与 protocol 已统一消费 `AgentRunView`，旧 `worker` 命名已退出正式实现主路径。
- `CONTROL.md`、`ARCHITECTURE.md` 与 understanding 文档已经补齐 `plan decision suspension`、`continuation` 与 `approval` 的职责区别。

## 验证

- `bun run typecheck`
- `bun test`
- 关键切片覆盖：
  - `tests/domain/agent-run.test.ts`
  - `tests/control/subagent-registry.test.ts`
  - `tests/control/verify-instantiation-policy.test.ts`
  - `tests/interface/agent-run-panel.test.tsx`
  - `tests/runtime/agent-run-view.test.ts`

## 已沉淀的稳定结论

- `AgentRun` 已经同时成为内部与对外的正式运行实例语义。
- `Verify` 是否实例化不再靠口头约定，而由明确规则决定。
- `plan mode` 可以形成 `waiting_plan_decision` 挂起，并通过 continuation 恢复同一个 run；它与 `approval` 是两种不同语义。
- 已完成计划应进入 `completed/`，而不是继续滞留在 `active/`。

## 刻意未做

- 没有把所有 subagent 都实体化为长期驻留实例。
- 没有重新设计 `Build / Plan` 关系；仍然坚持“`Build` 唯一 primary agent，`Plan` 只是 mode”。
- 没有把 `completed/` 扩写成历史档案馆；这里只保留对后续工作仍有参考价值的完成记录。
