# Understanding Space

这一组文档用于帮助快速理解 OpenPX 的当前代码事实。

如果你的目标是“先看懂系统再动手”，按下面顺序阅读：

1. [runtime-spine.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/runtime-spine.md)
2. [core-concepts.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/core-concepts.md)
3. [state-flows.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/state-flows.md)
4. [harness-code-map.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-code-map.md)
5. [harness-protocol-code-map.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-protocol-code-map.md)
6. [harness-feedback-loop.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-feedback-loop.md)
7. [harness-surface-boundary.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-surface-boundary.md)

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

### `harness-code-map.md`

回答：

- harness core 在哪里
- protocol 在哪里
- app server 在哪里
- surfaces 在哪里
- eval loop 在哪里

### `harness-protocol-code-map.md`

回答：

- `/health`
- `/snapshot`
- `/commands`
- `/events`
  分别由哪些文件实现

### `harness-feedback-loop.md`

回答：

- trace 从哪来
- rule 怎么评
- review item 怎么来
- promotion guardrail 怎么判

### `harness-surface-boundary.md`

回答：

- TUI client 负责什么
- remote kernel 负责什么
- App shell 负责什么
- 哪些职责不能回流到 harness core

## 不在这里做的事

这一层不负责：

- 具体执行计划
- feature 需求说明
- 外部参考资料
- 自动生成摘要
