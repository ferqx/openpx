# References

`references/` 用来存放外部参考资料。

这里的内容可以帮助理解第三方工具、框架、规范或外部文章，但它们默认不是 OpenPX 自身的控制权威。

## 适合放什么

- 第三方框架参考资料
- `llms.txt` 一类面向 AI 的参考文本
- 工具链使用说明的摘录
- 外部文章或设计资料的整理版

## 不适合放什么

- OpenPX 自身的架构真理
- 当前仓库的执行计划
- 未经控制文档提升的长期决策

## 使用规则

读取 `references/` 前，默认先读：

1. [AGENTS.md](/Users/chenchao/Code/ai/openpx/AGENTS.md)
2. [CONTROL.md](/Users/chenchao/Code/ai/openpx/CONTROL.md)
3. [ARCHITECTURE.md](/Users/chenchao/Code/ai/openpx/ARCHITECTURE.md)

只有当问题明确需要外部资料时，才进入 `references/`。

## 当前阶段约束

如果某份外部参考资料非常重要，也不要直接把它升级成仓库真理。  
正确做法是：

1. 先在代码或验证里确认它对 OpenPX 真的成立
2. 再把稳定结论回写到根级文档或 `docs/space/` 的人工维护文档
