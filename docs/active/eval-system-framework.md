# OpenPX Eval System Framework

Date: 2026-04-09
Status: Active
Related docs:
- `AGENTS.md`
- `ROADMAP.md`
- `docs/active/system-execution-framework.md`
- `docs/active/future-roadmap-capability-eval-ui-platform.md`
- `docs/active/agent-os-reset-design.md`
- `docs/active/agent-os-reset-plan.md`

---

## 1. Purpose

这份文档定义 OpenPX 的统一评估体系。

目标不是单独增加一套“测试平台”，
而是让 eval 成为 OpenPX runtime 与 capability 演进的一部分，
用于回答以下问题：

- 系统是否真的变强了
- 系统是否只是变复杂了
- 失败来自哪里
- 哪些问题属于能力问题，哪些属于控制流问题，哪些属于 operator 体验问题
- 哪些改动可以安全进入 release

这份文档是长期有效的评估规则文档。  
后续任何 capability、runtime、TUI、release 变更都必须与本文件一致。

---

## 2. Core principle

OpenPX 的 eval 原则只有一句话：

**所有重要能力都必须可测量；所有关键失败都必须可回放；所有行为变化都必须能被比较。**

---

## 3. Why eval is first-class in OpenPX

OpenPX 不是一个只输出最终文本的系统。  
它是一个 long-running、可审批、可中断、可恢复的 Agent OS。

因此，OpenPX 的评估不能只看“最后答案像不像对的”，
还必须看：

- 执行链是否健康
- 控制语义是否正确
- 恢复是否可靠
- side effects 是否安全
- operator 是否仍能监督系统

换句话说：

**OpenPX 的 eval 不只是结果评估，也是系统行为评估。**

---

## 4. Eval scope

OpenPX 的评估默认覆盖 5 类对象：

### 4.1 Outcome
最终做成了吗？

### 4.2 Trajectory
执行过程是否走得健康？

### 4.3 Recovery
中断、审批、重试、恢复是否可靠？

### 4.4 Safety / Control
系统是否在正确边界内执行？

### 4.5 Operator trust
用户是否仍能理解、监督、并愿意继续放权？

---

## 5. Eval layers

OpenPX 采用三层 eval 模型。

---

## 5.1 Layer A — Outcome Eval

### Purpose

回答：

**“最终目标有没有达成？”**

### Typical questions

- task 是否完成
- answer 是否与 thread 目标一致
- artifact 是否属于正确 package
- approval 后是否继续完成原目标
- reject 后是否进入合理 replan
- 最终输出是否可提交 / 可审阅 / 可验证

### Preferred graders

优先级如下：

1. deterministic code-based grader
2. rule-based structured grader
3. model-based grader
4. human review

### Rule

能用代码判定的，优先用代码判定。  
不要在可以精确判断的场景里优先引入 model grader。

---

## 5.2 Layer B — Trajectory Eval

### Purpose

回答：

**“过程是否健康？”**

### Typical questions

- 是否走了统一 graph-backed path
- 是否请求了多余 approval
- 是否遗漏了必要 approval
- 是否发生了错误状态迁移
- 是否出现重复 side effects
- 是否在错误时间点生成或提交 artifact
- 是否出现 task / worker / package 归属混乱
- hydration / replay 后可见状态是否漂移

### Why it matters

对于 OpenPX，过程错误和结果错误同样重要。  
因为系统可能“最后做对了”，但过程已经不可维护、不可恢复或不可监督。

Trajectory eval 是 OpenPX 的核心评估层之一。

---

## 5.3 Layer C — Human Review Eval

### Purpose

回答：

**“对用户来说，这次协作是否可信、可控、值得继续放权？”**

### Typical questions

- approval 提示是否清楚
- blocked reason 是否可理解
- recovery options 是否可操作
- answer / artifact 是否可审阅
- operator 是否知道下一步该怎么干预
- 用户在哪些节点频繁打断
- 用户在哪些节点失去信任

### Role

Human review eval 不是为了替代自动化 eval，  
而是为了发现自动规则覆盖不到的高价值失败样本。

---

## 6. Eval object model

评估体系必须围绕稳定 runtime object 构建。  
默认对象集合：

- `Thread`
- `Run`
- `Task`
- `Worker`
- `Approval`
- `Artifact`
- `Answer`
- `RuntimeSnapshot`
- `RuntimeEvent`

任何评估结果都应尽量归因到这些对象，  
而不是归因到模糊 transcript 片段或 UI 表象。

---

## 7. Evaluation units

OpenPX 的最小评估单位不是单个 prompt，
而是以下四种之一：

### 7.1 Scenario
一个可复现的工作流场景。

### 7.2 Run
一次真实或回放运行。

### 7.3 Transition
一个关键状态转换点。

### 7.4 Review Item
一个需要人工复盘的失败或异常样本。

---

## 8. Scenario model

### 8.1 Definition

Scenario 是 OpenPX 评估体系的基础输入。

一个 scenario 应包含：

- 初始任务目标
- runtime 环境约束
- 期望控制语义
- 期望关键状态迁移
- 期望结果
- 可接受的变体范围

### 8.2 Scenario categories

建议至少固定以下场景族：

#### A. Happy path
基础任务成功完成。

#### B. Approval-required path
任务中触发审批并正确继续。

#### C. Reject-and-replan path
审批被拒绝后进入合理 replan。

#### D. Interrupt-and-resume path
运行中断后成功恢复。

#### E. Artifact path
生成、验证、提交产物。

#### F. Recovery path
restart / hydrate / replay 后状态一致。

#### G. Control-boundary path
验证不该自动执行的动作没有被偷偷执行。

### 8.3 Scenario discipline

任何核心能力改动，至少新增或更新一个 scenario。  
没有 scenario 的能力演进，不视为完成。

当前默认本地 gate 入口为：

- `bun run eval:core`
- `bun run eval:review`

对于 runtime / control 相关改动，`eval:core` 应视为默认验证命令之一。
对于 fail / suspicious 产生的 review items，`eval:review` 是默认本地人工消费入口。
这些入口都属于 internal developer eval workflow，不属于产品接口，也不面向最终使用者。

当前这层 eval 明确定位为 fast deterministic control regression eval。
它会真实写出 `scenario result / comparable object / outcome results / trajectory results / review queue items`，
但默认不会调用真实模型做长链路 agent 执行评估，因此不能替代后续的 real agent eval。

如果需要读取当前层的原始 eval 数据，而不是只看文本摘要：

- `bun run eval:core --json`
- `bun run eval:suite --suite core-eval-suite --json`
- `bun run eval:review --json`

这些 `--json` 导出都属于内部开发侧数据面；默认数据落在工作区内的 `.openpx/eval/eval.sqlite`。

### 8.4 Internal command usage

当前内部 eval 命令面按以下方式使用：

- 跑默认 core gate：
  - `bun run eval:core`
- 跑指定 suite：
  - `bun run eval:suite --suite core-eval-suite`
- 跑指定 scenario：
  - `bun run eval:suite --suite core-eval-suite --scenario approval-required-then-approved`
- 更新 baseline：
  - `bun run eval:suite --suite core-eval-suite --update-baseline --baseline-root-dir eval-baselines`
- 查看 review queue：
  - `bun run eval:review`
  - `bun run eval:review --status closed`
  - `bun run eval:review --stats-only`

如果需要机器可读的原始结构化数据：

- `bun run eval:core --json`
- `bun run eval:suite --suite core-eval-suite --json`
- `bun run eval:review --json`

`eval:suite --json` 当前会返回：

- `summary`
- `suiteRun`
- `scenarioResults`
- `reviewItems`

`eval:review --json` 当前会返回：

- `filters`
- `aggregate`
- `items`

如果需要直接检查底层 SQLite：

- 默认路径：`.openpx/eval/eval.sqlite`
- 关键表：
  - `eval_suite_runs`
  - `eval_scenario_results`
  - `eval_review_queue`

---

## 9. Grader model

### 9.1 Deterministic graders

适用于：

- task completion
- artifact ownership correctness
- expected state reached
- invalid state transition detection
- duplicate side-effect detection
- required approval missing / extra approval issued

### 9.2 Rule-based structured graders

适用于：

- event sequence shape
- lifecycle conformance
- recovery contract checks
- package scoping checks

### 9.3 Model-based graders

适用于：

- answer-goal alignment
- operator-facing clarity
- explanation usefulness
- open-ended quality judgment

### 9.4 Human graders

适用于：

- trust / controllability assessment
- high-value failures
- ambiguous or product-facing edge cases

### 9.5 Grader priority rule

固定优先级：

`deterministic > structured rules > model > human`

---

## 10. Trace model

### 10.1 Trace purpose

Trace 用于记录可回放、可归因、可比较的执行轨迹。

它不是 debug dump。  
它必须服务于：

- replay
- failure analysis
- trajectory eval
- release comparison
- review queue generation

### 10.2 Trace must include

- run identity
- thread/task/worker linkage
- critical state transitions
- approval/reject/resume milestones
- artifact milestones
- answer milestones
- side-effect records
- snapshot checkpoints（如适用）

### 10.3 Trace must avoid

- 无边界 debug 噪声永久化
- UI-only transient state
- 与 runtime object 无关的非结构化堆叠日志

---

## 11. Review queue

### 11.1 Purpose

Review queue 用于沉淀高价值失败样本。  
它服务于：

- 手动复盘
- 新 scenario 提炼
- 新 grader 设计
- release 风险分析

### 11.2 What enters review queue

以下样本默认应进入 review queue：

- outcome fail
- suspicious trajectory
- duplicate side effect
- missing approval
- invalid recovery
- artifact ownership confusion
- operator confusion signals
- behavior regression candidates

### 11.3 Review output

一次 review 至少产出以下之一：

- 新 scenario
- 新 grader
- 新 protocol/view requirement
- 新 documentation change
- 新 release risk note

---

## 12. Local Gate Discipline

当前阶段先采用本地开发 gate，而不是远端 CI gate。

默认要求：

- `bun run eval:core`
- `bun test tests/eval`
- `bun run typecheck`

其中：

- `failed` 与 baseline regression 必须阻断
- `suspicious` 先不阻断，但必须进入 review queue
- review / baseline / scenario result 数据默认应写入独立 eval data dir，而不是普通 runtime 用户数据面

---

## 12. Minimum eval requirement for any feature

任何进入开发的新功能，至少必须携带：

### A. 1 个 scenario
描述它如何被验证。

### B. 1 个 outcome check
描述“结果对不对”怎么判定。

### C. 1 个 trajectory rule 或 review hook
描述“过程是否健康”怎么观察。

### D. Docs impact note
说明它是否影响：
- active docs
- release notes
- behavior notes
- migration notes

---

## 13. Eval and release relationship

Eval 不只是研发期工具，  
也是 release gate 的一部分。

任何 release candidate 至少应通过：

- scenario suite
- core outcome evals
- core trajectory evals
- critical review queue triage

若能力改动不能通过上述门槛，则不应进入稳定发布。

---

## 14. Eval and TUI relationship

TUI / Operator UI 不应定义 eval truth。  
它只能消费评估结果和 trace summary。

TUI 可以展示：

- scenario status
- run health
- blocked diagnosis
- recovery confidence
- review queue summary

但不应自行发明：

- 成败定义
- trajectory truth
- control-boundary truth

这些都应来自 runtime + eval layer。

---

## 15. Metrics families

建议长期固定以下指标族。

### 15.1 Capability metrics
- task completion rate
- approval resume success rate
- rejection replan success rate
- artifact ownership correctness
- interrupt/resume consistency
- replay/hydration consistency

### 15.2 Trajectory metrics
- invalid state transition count
- duplicate side-effect rate
- unnecessary approval rate
- missing approval rate
- graph-path conformance rate

### 15.3 Recovery metrics
- recovery success rate
- restart reattachment success rate
- hydration parity rate
- replay parity rate

### 15.4 Operator metrics
- blocked-state diagnosis time
- approval resolution clarity
- recovery success after intervention
- artifact review completeness

### 15.5 Governance metrics
- feature changes with scenario coverage
- behavior changes with eval updates
- release candidates with full eval pass
- review queue closure yield
- review items closed with explicit resolution type

当前内部统计口径下，`review queue closure yield` 至少应包括：

- `open / triaged / closed` 数量
- `closed by resolutionType` 数量
- `closed with follow-up` 数量
- `closed missing follow-up` 数量
- `accepted_noise` 数量

对于 suite-level internal eval runs，同样应输出一份 scoped aggregate，
但口径只针对“当前 suite run 新产生的 review items”，不混入全库历史。

---

## 16. Anti-patterns

以下行为属于 OpenPX eval 反模式：

### Anti-pattern 1
“这个功能先做出来，eval 以后再补”

### Anti-pattern 2
“只要最后结果像对的，过程先不管”

### Anti-pattern 3
“trace 先全量打出来，之后再慢慢整理”

### Anti-pattern 4
“能代码判定的场景也先上 model grader”

### Anti-pattern 5
“失败样本只在群里讨论，不进入 review queue”

### Anti-pattern 6
“release 前人工看一下感觉没问题就行”

---

## 17. Decision framework

以后遇到 eval 相关分歧时，按下面顺序判断：

### Question 1
这个能力是否已有最小 scenario？

### Question 2
这个能力是否已有 outcome 判定？

### Question 3
这个能力是否已有 trajectory 观察点？

### Question 4
失败是否能归因到稳定 runtime object？

### Question 5
这个评估设计是否过度依赖 UI 表现或人工解释？

若 Question 5 的答案是“是”，则评估设计应回退重做。

---

## 18. Success definition

当以下条件长期成立时，说明 OpenPX 的 eval 体系开始运转正常：

- 核心能力都有固定 scenario suite
- outcome eval 可以稳定自动运行
- trajectory eval 能抓到主要控制流问题
- review queue 能持续产出高价值样本
- release gate 开始真实依赖 eval
- TUI / operator shell 只是消费评估结果，而不发明评估真相

---

## 19. Short version

OpenPX 的 eval 体系不是附属工具，
而是 Agent OS 的质量闭环。

它必须做到三件事：

- 用 scenario 固定预期
- 用 grader 判断结果和过程
- 用 review queue 把失败变成下一轮改进输入
