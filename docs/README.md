# Documentation Guide

本目录用于区分 OpenPX 的当前有效设计、短周期执行计划与历史归档材料。  
目标是让任何人在进入文档体系后，能够快速回答三个问题：

1. 现在项目主线是什么
2. 当前实现应以哪份文档为准
3. 某份旧文档是否仍然有效

---

## 文档优先级

当多份文档出现冲突时，按以下顺序解释：

1. `AGENTS.md`
2. 仓库根目录 `ROADMAP.md`
3. `docs/active/`
4. `docs/work-packages/`
5. `docs/historical/`

低优先级文档不得覆盖高优先级文档。  
如果出现冲突，应更新、归档或删除低优先级文档，而不是长期并存。

---

## 与 `superpowers` 技能的兼容规则

当前仓库中的不少设计与计划文档路径由 `superpowers` 相关技能约束决定。  
在这些技能或其模板调整之前，文档体系应优先兼容现有物理路径，而不是强行迁移目录。

因此需要区分两层概念：

- **语义分类**：`active` / `work-packages` / `historical`
- **物理路径**：当前可继续位于 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`

当前兼容约定如下：

- `docs/superpowers/specs/` 可以承载 `Active` 或 `Historical` 设计文档
- `docs/superpowers/plans/` 可以承载 `Working` 的 work package，也可以承载当前有效的实现计划
- 是否属于 active / working / historical，以文档头部 `Status` 和仓库级入口文档解释为准，不仅由目录名决定
- 在 superpowers 技能未调整前，不要求为了目录整洁而批量迁移现有文档

换句话说：

**先统一语义和优先级，再决定是否迁移物理目录。**

---

## 目录说明

### `docs/active/`

当前有效的系统设计与实现基线。  
这些文档用于回答：

**“现在应该按什么做？”**

要求：

- 每个主题只允许一个 active baseline
- 文档头部必须写明 `Status: Active`
- 如 supersede 旧文档，必须写明 supersedes 哪些文件
- 允许引用历史文档，但不得与其并列竞争
- 适合长期保存，并作为当前实现依据

适合放入：

- agent os reset design
- runtime protocol baseline
- runtime architecture baseline
- product direction baseline

兼容说明：

- 在过渡期内，这一类文档也可以继续位于 `docs/superpowers/specs/`

---

### `docs/work-packages/`

当前迭代中的短周期执行文档。  
这些文档用于回答：

**“这一小块准备怎么落地？”**

要求：

- 一个 work package 只解决一个主问题
- 必须写明问题背景
- 必须写明 touched files
- 必须写明 test plan
- 必须写明 exit criteria
- 必须明确与哪个 milestone 或 active design 对齐
- 完成后要么吸收进 `docs/active/`，要么归档到 `docs/historical/`

适合放入：

- active work package worker context
- current package artifact flow
- approval resume artifact execution
- rejection resume graph flow
- runtime view simplification for TUI consumption
- daemon reuse / recovery verification

兼容说明：

- 在过渡期内，这一类文档主要继续位于 `docs/superpowers/plans/`

---

### `docs/historical/`

历史方案、被 supersede 的设计、阶段性探索记录。  
这些文档用于回答：

**“我们之前是怎么想的？”**

要求：

- 文档头部必须写明 `Status: Historical`
- 如已失效，必须指向替代文档
- 不作为当前实现依据
- 可以保留参考价值，但不能与 active baseline 竞争
- 不应在没有说明的情况下与当前设计并列出现

适合放入：

- 旧 roadmap
- reset 前 architecture notes
- 旧 tui optimization / minimalist refactor
- 已被重写的 compaction / tail / layout 方案
- 阶段性试验记录

兼容说明：

- 在过渡期内，historical 文档也可以保留在 `docs/superpowers/specs/` 或 `docs/superpowers/plans/`
- 关键不是物理移动，而是必须明确标记 `Status: Historical` 和替代文档

---

## 文档状态规范

每份设计/计划文档都应在头部包含以下字段：

- `Date: YYYY-MM-DD`
- `Status: Active | Working | Historical`
- `Owner:`（可选）
- `Related milestone:`（可选）
- `Supersedes:`（可选）
- `Superseded by:`（可选）

推荐模板如下：

```md
# Some Design

Date: 2026-04-09
Status: Active
Owner: openpx
Related milestone: M2
Supersedes:
- docs/historical/older-design.md
```

如为工作包文档：

```md
# Some Work Package

Date: 2026-04-09
Status: Working
Related milestone: M1

## Problem
...

## Touched files
- ...

## Test plan
- ...

## Exit criteria
- ...
```

如为历史文档：

```md
# Some Historical Note

Date: 2026-04-03
Status: Historical
Superseded by:
- docs/active/agent-os-reset-design.md
```

---

## 冲突处理规则

如果两份文档都在描述同一主题：

- 只能保留一份为 active
- 另一份要么转入 historical，要么拆成 work package
- 不允许两份“当前路线”同时有效
- 不允许用时间更新来掩盖状态冲突
- 新文档不能在未处理旧 baseline 的情况下直接落地

换句话说：

**同一主题只能有一个当前答案。**

---

## 新建文档前的检查项

新增文档前，先回答下面 5 个问题：

1. 这是长期基线，还是短期执行文档？
2. 它是否与已有 active 文档重叠？
3. 它完成后会沉淀到哪里？
4. 它是否真的需要单独成文？
5. 它是否会制造第二套路线叙事？

若无法明确回答，不应创建新文档。

---

## 更新文档时的要求

更新文档时，应优先：

- 直接更新已有 active baseline
- 在原文档中补充新的约束、边界和结论
- 只在问题足够独立时单独拆出 work package

避免以下做法：

- 遇到实现变化就新写一份平行设计
- 用“v2 / revised / new / reset2”不断堆文档
- 把短期执行记录写成长效基线
- 让 work package 长期替代 active design

---

## 当前建议结构

建议逐步整理为目标结构：

```txt
docs/
  README.md
  active/
    agent-os-reset-design.md
    agent-os-reset-plan.md
    runtime-architecture.md
  work-packages/
    active-work-package-worker-context.md
    current-package-artifact-flow.md
    approval-resume-artifact-execution.md
    rejection-resume-graph-flow.md
  historical/
    cli-runtime-roadmap-design.md
    current-architecture.md
    ...
```

说明：

- `active/` 只放当前有效的长期基线
- `work-packages/` 只放当前迭代执行切片
- `historical/` 放被 supersede 的旧材料
- `README.md` 是整个 docs 的唯一入口

兼容说明：

- 上述是目标结构，不是当前必须立即完成的物理迁移
- 在 superpowers 技能仍依赖现有路径时，允许继续使用 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`
- 只要状态、优先级和 supersession 关系清楚，现阶段可以不移动文件

---

## 当前约定

当前项目主线默认以以下文档为准：

- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/2026-04-06-agent-os-reset-design.md`
- `docs/active/2026-04-06-agent-os-reset-plan.md`

如果其他文档与以上内容冲突，应视为：

- 尚未更新
- 已被 supersede
- 或需要归档处理

除非被上述文档显式引用，其余文档默认不视为当前最高优先级依据。

---

## 当前 superpowers 映射

在当前兼容期内，`docs/superpowers/` 下的文档按以下语义解释：

### Active

- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

### Working

- `docs/superpowers/plans/2026-04-06-agent-os-reset-batch-1.md`
- `docs/superpowers/plans/2026-04-06-agent-os-tail-plan.md`
- `docs/work-packages/2026-04-09-active-work-package-worker-context.md`
- `docs/work-packages/2026-04-09-current-package-artifact-flow.md`
- `docs/work-packages/2026-04-09-approval-resume-artifact-execution.md`
- `docs/work-packages/2026-04-09-rejection-resume-graph-flow.md`

### Historical

Representative historical documents include:

- `docs/superpowers/specs/2026-04-01-langgraph-bun-agent-os-design.md`
- `docs/historical/2026-04-02-cli-runtime-roadmap-design.md`
- `docs/historical/2026-04-03-current-architecture.md`
- `docs/superpowers/specs/2026-04-04-thread-compaction-policy-design.md`
- `docs/superpowers/specs/2026-04-05-stream-event-architecture-design.md`
- `docs/superpowers/specs/2026-04-05-tui-optimization-design.md`
- `docs/superpowers/specs/2026-04-05-tui-minimalist-refactor-design.md`
- `docs/superpowers/specs/2026-04-06-screen-layout-and-stream-isolation-design.md`
- `docs/superpowers/specs/2026-04-06-tui-plan-and-settings-design.md`
- `docs/superpowers/specs/2026-04-06-tui-v1-shell-design.md`
- `docs/superpowers/specs/2026-04-06-welcome-pane-redesign-design.md`
- `docs/superpowers/plans/2026-04-01-langgraph-bun-agent-os-v1.md`
- `docs/superpowers/plans/2026-04-05-thread-compaction-policy-v1.md`
- `docs/superpowers/plans/2026-04-05-thread-compaction-policy-v1.2.md`
- `docs/superpowers/plans/2026-04-05-thread-compaction-policy-v1.3.md`
- `docs/superpowers/plans/2026-04-05-thread-compaction-policy-v1.4.md`
- `docs/superpowers/plans/2026-04-05-tui-minimalist-performance.md`
- `docs/superpowers/plans/2026-04-06-screen-layout-and-stream-isolation.md`
- `docs/superpowers/plans/2026-04-06-tui-plan-and-settings-implementation.md`
- `docs/superpowers/plans/2026-04-06-tui-shell-polish.md`
- `docs/superpowers/plans/2026-04-06-tui-v1-shell-implementation.md`
- `docs/superpowers/plans/2026-04-06-welcome-pane-redesign.md`

If a `docs/superpowers/` document conflicts with the mapping above, interpret the document according to its `Status` field and the higher-priority entry documents.

Canonical documents moved into `docs/active/`, `docs/work-packages/`, or `docs/historical/` take precedence over retained compatibility copies under `docs/superpowers/`.

---

## 文档维护目标

文档体系应服务于以下目标：

### 1. 单一主线

任何时候，项目都应只有一个当前路线入口。  
不能让 roadmap、reset、redesign、refactor 几套叙事同时竞争。

### 2. 降低实现歧义

开发者在进入实现前，应能快速知道：

- 当前 baseline 是什么
- 当前 work package 是什么
- 哪些旧方案已经无效

### 3. 让历史可追踪，但不干扰当前开发

历史文档可以保留。  
但它们应当被清楚标记，并退出当前实现决策链。

### 4. 让文档随实现收敛，而不是继续发散

文档体系的目标不是“记录所有想法”，  
而是帮助项目从多套叙事收敛到单一执行主线。

---

## 维护规则

### Rule 1 - Active 文档少而稳

能更新现有 active 文档，就不要新建同主题文档。

### Rule 2 - Work package 小而清晰

一个 work package 只处理一个主问题。  
完成后必须吸收或归档，不能无限堆积。

### Rule 3 - Historical 文档明确退出

进入 `historical/` 的文档，默认不再参与当前实现决策。

### Rule 4 - 文档服务代码，不与代码抢主线

文档必须帮助实现收口。  
不能让文档体系自身成为复杂度来源。

### Rule 5 - 先兼容技能，再迁移目录

如果文档路径被技能、模板或自动化流程依赖，优先保持路径兼容。  
目录迁移应在技能同步更新后进行，而不是先打破现有工具约束。

---

## 判断一份文档是否应该归档

出现以下任一情况时，通常应转入 `historical/`：

- 它描述的是已被替代的系统边界
- 它的目标已经不再是当前优先级
- 它与当前 active baseline 冲突
- 它只保留参考价值，不再指导实现
- 它与现有 work package 或 active design 高度重叠

---

## 短版规则

只记住这几条就够了：

- `AGENTS.md` 和 `ROADMAP.md` 是总入口
- 长期基线放 `docs/active/`
- 当前执行切片放 `docs/work-packages/`
- 旧方案放 `docs/historical/`
- 在 superpowers 兼容期内，可继续放在 `docs/superpowers/specs/` 和 `docs/superpowers/plans/`
- 同一主题只能有一个 active baseline
- 能更新旧文档，就不要新建平行文档
