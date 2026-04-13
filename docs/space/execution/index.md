# Execution Space

这一组文档用于指导 AI 在 OpenPX 中安全执行改动、验证结果并回写稳定结论。

如果目标是“开始做事”，按下面顺序进入：

1. [coding-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/coding-workflow.md)
2. [validation-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/validation-workflow.md)
3. [refactor-playbook.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/refactor-playbook.md)
4. [tech-debt-tracker.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/tech-debt-tracker.md)

## 当前范围

当前 v1 先放四份核心执行文档：

- `coding-workflow.md`
- `validation-workflow.md`
- `refactor-playbook.md`
- `tech-debt-tracker.md`

以及两个计划目录：

- `active/`
  当前活跃执行计划
- `completed/`
  已完成执行计划

对应入口：

- [active/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/active/index.md)
- [completed/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/completed/index.md)

如果执行空间继续扩展，再优先沿这四份文档的子主题扩展，而不是重新建立平行总览。

## 各文档负责什么

### `coding-workflow.md`

回答：

- AI 在 OpenPX 中安全改代码的默认步骤是什么
- 进入实现前要确认哪些边界
- 哪些稳定结论必须回写文档

### `validation-workflow.md`

回答：

- `eval`、`real-eval`、`validation` 各自负责什么
- 改动后应该跑哪条验证通道
- 结果如何回流到修复动作

### `refactor-playbook.md`

回答：

- 如何在 OpenPX 中做小步结构减法
- 什么时候先抽支持逻辑，什么时候再抽生命周期或桥接层
- 如何避免一次性大拆

### `tech-debt-tracker.md`

回答：

- 当前确认存在的复杂度热点是什么
- 哪些技术债已经确认但暂时不处理
- 如果继续收结构，下一轮优先级是什么

### `active/`

回答：

- 当前哪些执行计划正在推进
- 每个活跃计划的目标、边界和完成标准是什么
- 哪些计划还不应该进入实现

### `completed/`

回答：

- 已完成的执行计划有哪些
- 它们解决了什么问题
- 哪些稳定结论已经沉淀到根级文档或 `space`

## 这一层不负责什么

执行空间不负责：

- 重新定义系统架构
- 覆盖 `CONTROL.md` 的控制权威
- 把 generated 内容升级成长期真理
