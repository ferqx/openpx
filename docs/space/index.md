# OpenPX Space

`docs/space/` 是 OpenPX 的官方知识空间。

它的目标是：

- 帮助 AI 和人类快速理解当前代码事实
- 帮助 AI 在改代码和验证时保持可控
- 用索引方式组织知识，避免再次回到“大量文档同时像权威”的状态

## 读取规则

进入 `docs/space/` 之前，默认先读：

1. [AGENTS.md](/Users/chenchao/Code/ai/openpx/AGENTS.md)
2. [CONTROL.md](/Users/chenchao/Code/ai/openpx/CONTROL.md)
3. [ARCHITECTURE.md](/Users/chenchao/Code/ai/openpx/ARCHITECTURE.md)

只有在这三份仍不足以回答问题时，才按索引进入 `space`。

## 目录结构

### `understanding/`

理解型空间。  
适合回答：

- 系统从哪里启动
- 主路径是什么
- 核心术语是什么意思
- 关键状态怎么流转

入口： [understanding/index.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/index.md)

当前与 harness-first 代码落位最直接相关的理解文档包括：

- [harness-code-map.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-code-map.md)
- [harness-protocol-code-map.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-protocol-code-map.md)
- [harness-feedback-loop.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-feedback-loop.md)
- [harness-surface-boundary.md](/Users/chenchao/Code/ai/openpx/docs/space/understanding/harness-surface-boundary.md)

### `execution/`

执行型空间。  
适合回答：

- AI 在这个仓库里应该怎么安全改代码
- 先读哪些内容，再动哪些文件
- 怎么验证、怎么回写文档、怎么保持控制面稳定

入口： [execution/index.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/index.md)

当前 v1 的核心执行文档包括：

- [coding-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/coding-workflow.md)
- [validation-workflow.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/validation-workflow.md)
- [refactor-playbook.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/refactor-playbook.md)
- [tech-debt-tracker.md](/Users/chenchao/Code/ai/openpx/docs/space/execution/tech-debt-tracker.md)

### `references/`

外部参考资料区。  
这里的内容是参考，不是 OpenPX 自身的控制权威。

入口： [references/index.md](/Users/chenchao/Code/ai/openpx/docs/space/references/index.md)

### `generated/`

生成或派生材料区。  
默认不直接作为长期权威，除非被根级控制文档明确提升。

入口： [generated/index.md](/Users/chenchao/Code/ai/openpx/docs/space/generated/index.md)

## 使用原则

- 先看索引，再看正文
- `understanding/` 用于建立心智模型
- `execution/` 用于实际做事
- `references/` 和 `generated/` 默认降权
- 不默认全扫整个 `space`

## 当前 v1 范围

当前 `space` 第一批只覆盖两个主场景：

1. 理解型
2. 执行型

后续如果要扩展主题，应优先作为这两条主线下的子文档，而不是先建立新的平行总览文档。
