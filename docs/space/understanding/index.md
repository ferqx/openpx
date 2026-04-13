# Understanding Space

这一组文档用于帮助快速理解 OpenPX 的当前代码事实。

如果你的目标是“先看懂系统再动手”，按下面顺序阅读：

1. [runtime-spine.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/runtime-spine.md)
2. [core-concepts.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/core-concepts.md)
3. [state-flows.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/state-flows.md)

## 每个文档回答什么

### `runtime-spine.md`

回答：

- 系统从哪里启动
- 产品主路径是哪条
- 哪些文件是主路径，哪些不是

### `core-concepts.md`

回答：

- `thread / run / task / approval / runtime / kernel / protocol` 各自是什么意思
- 这些术语在代码里的落点是什么

### `state-flows.md`

回答：

- submit
- waiting approval
- approve resume
- reject replan
- interrupt / hydrate

## 不在这里做的事

这一层不负责：

- 具体执行计划
- feature 需求说明
- 外部参考资料
- 自动生成摘要
