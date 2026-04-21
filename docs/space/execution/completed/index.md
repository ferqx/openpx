# Completed Execution Plans

`completed/` 用来存放已经完成并验证过的执行计划。

它回答的是：

- 哪些计划已经真正做完
- 完成后沉淀了哪些稳定结论
- 后续如果要继续扩展，应该接着哪条已完成路径往下走

## 进入规则

只有满足下面条件的计划，才进入 `completed/`：

1. 主要实现已经完成
2. 对应验证已经运行
3. 稳定结论已经回写到根级文档或 `docs/space/`

如果只是“代码大部分写完”，但还没有验证或还没沉淀结论，就不应提前放进这里。

## 文件应该写什么

每个已完成计划应至少说明：

1. 当时要解决的问题
2. 实际做了什么
3. 跑了哪些验证
4. 留下了哪些稳定结论
5. 还有哪些刻意未做的部分

这能帮助后续 AI 或人快速判断：
“这件事是真的完成了，还是只是做过一半。”

## 文件不该写什么

不要把 `completed/` 当成：

- 第二份路线图
- 历史档案馆
- 大量聊天记录归档区

它只保留对后续工作仍有参考价值的已完成计划。

## 与其他文档的关系

- 长期控制权仍然在根级文档
- 理解型知识仍应沉淀到 `understanding/`
- 执行方法仍应沉淀到 `execution/` 的 workflow 文档

`completed/` 只保留“这次计划怎么完成的”这一层事实。

## 当前已完成计划

- [agent-mode-agentrun-refactor.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/completed/agent-mode-agentrun-refactor.md)
  收束 `Build / threadMode / AgentRun` 的第一阶段重构，完成协议、UI 与生命周期命名分层。
- [agent-mode-agentrun-followup.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/completed/agent-mode-agentrun-followup.md)
  完成运行实例、subagent 合同、Verify 实例化规则与稳定文档回写的第二阶段收尾。
