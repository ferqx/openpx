# Harness Feedback Loop

这份文档说明 OpenPX 的 harness feedback loop（反馈闭环）如何从真实运行事实进入评测、分诊与晋升判断。

## Trace Truth Sources

真实 trace 不从 surface state（表面状态）构造，而从 durable truth sources（可持久恢复的真相源）构造。

当前代码锚点：

- `threadStore`
- `runStore`
- `taskStore`
- `approvalStore`
- `eventLog`
- `executionLedger`
- `workerStore`

对应文件：

- `src/harness/eval/real/trace.ts`

这里的关键约束是：

- snapshot 是 projection，不是真相源
- trace 来自 durable stores、event log 与 ledger，而不是 TUI state

## Evaluation Rules

evaluation（评估）同时覆盖 outcome（结果）与 trajectory（轨迹），而不是只看最终结果。

当前代码锚点：

- `evaluateApprovalOutcome`
- `evaluateRejectionOutcome`
- `evaluateArtifactOutcome`
- `evaluateResumeOutcome`
- `evaluateApprovalTrajectory`
- `evaluateRejectionTrajectory`
- `evaluateArtifactTrajectory`
- `evaluateRecoveryTrajectory`

对应文件：

- `src/harness/eval/real/evaluation.ts`

## Review Queue

失败或可疑结果不会停留在终端输出，而会被提炼成 review item（分诊项）进入后续处理链路。

当前代码锚点：

- `RealReviewCandidate`
- `deriveReviewItems`
- `src/harness/eval/real/review-queue.ts`

## Promotion Guardrails

promotion（晋升）不看单次演示是否成功，而看三类证据是否同时成立：

- live real-eval 是否通过
- deterministic regression（确定性回归）是否存在
- runtime regression（运行时回归）是否存在

对应文件：

- `src/harness/eval/real/promotion.ts`

这意味着 promotion readiness（晋升准备度）依赖反馈闭环，而不是依赖单次 happy path（理想路径）演示。
