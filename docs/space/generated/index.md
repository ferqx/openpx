# Generated

`generated/` 用来存放 AI 生成或工具派生出来的材料。

它们可以有用，但默认不直接作为 OpenPX 的长期权威。

## 适合放什么

- schema 摘要
- 自动扫描结果
- AI 生成的结构化分析
- 从代码或数据库派生出来的说明文档

## 每份生成材料必须标明什么

至少标明：

1. 生成时间
2. 生成来源
3. 适用范围
4. 非权威声明

如果缺少这四项，后续很容易再次失真。

## 使用规则

默认情况下：

- `generated/` 只能作为辅助阅读材料
- 不能直接压过代码、测试和根级控制文档
- 不能跳过索引直接把生成内容当系统真理

如果某份生成材料被证明长期稳定，应把其中的稳定结论提炼回：

- 根级文档
- 或 `docs/space/` 的人工维护文档

而不是长期依赖原始生成文件本身。

## 当前阶段约束

OpenPX 之前已经吃过“AI 生成内容失控”的亏。  
所以 `generated/` 必须始终遵守这条原则：

**可以生成，但不能天然拥有权威。**

## 当前材料

- [2026-04-18-m3-cost-baseline-v1.md](/Users/chenchao/Code/ai/openpx/docs/space/generated/2026-04-18-m3-cost-baseline-v1.md)
- [2026-04-18-m3-cross-provider-validation-report.md](/Users/chenchao/Code/ai/openpx/docs/space/generated/2026-04-18-m3-cross-provider-validation-report.md)
