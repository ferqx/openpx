# Rejection Resume Graph Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route approval rejections back through the graph for checkpoint-backed runs so the coordinator can replan instead of the control plane terminating the task directly.

**Architecture:** Preserve legacy/manual seeded approval behavior, but for active checkpoint-backed runs, convert `rejectRequest` into a graph resume with a synthesized rejection reason. That reason should be stable and explicit enough to steer planning away from the rejected action without requiring free-form user text. Keep the approval gate and interrupt/resume contract intact; only the control-plane integration and tests should change.

**Tech Stack:** TypeScript, Bun test, LangGraph.js

---

### Task 1: Lock Reject Flow Expectations

**Files:**
- Modify: `tests/app/bootstrap.test.ts`
- Modify: `tests/runtime/interrupt-resume.test.ts` only if needed

- [x] **Step 1: Write the failing tests**
  Add coverage proving that graph-backed rejections do not just cancel the run; they resume planning and return a deterministic summary. Keep legacy fallback behavior covered.

- [x] **Step 2: Run tests to verify they fail**
  Run: `bun test tests/app/bootstrap.test.ts tests/runtime/interrupt-resume.test.ts`
  Expected: FAIL because `rejectRequest` still short-circuits in the control plane.

- [x] **Step 3: Implement the minimal assertions fix**
  No production code yet. Refine expectations until they fail for the intended reason only.

### Task 2: Resume Rejections Through The Graph

**Files:**
- Modify: `src/app/bootstrap.ts`
- Modify: `src/runtime/graph/root/resume-control.ts` only if extra fields are needed

- [x] **Step 1: Implement checkpoint-aware rejection branching**
  Detect whether the approval belongs to a checkpoint-backed active run.

- [x] **Step 2: Synthesize a stable rejection reason**
  Use approval summary to build a deterministic planner-facing rejection message, e.g. “Rejected approval for <summary>. Replan without that action.”

- [x] **Step 3: Resume the graph for checkpoint-backed runs**
  Update approval status first, then convert checkpoint-backed rejection into a fresh planner run after closing the interrupted run and clearing the stale checkpoint state.

- [x] **Step 4: Preserve legacy fallback**
  If there is no run or no checkpoint, keep the existing direct completion/cancellation semantics so older seeded approvals still work.

- [x] **Step 5: Re-run tests**
  Run: `bun test tests/app/bootstrap.test.ts tests/runtime/interrupt-resume.test.ts`
  Expected: PASS

### Task 3: Verify, Commit, And Publish

**Files:**
- Modify: tests only if type drift appears

- [x] **Step 1: Run focused regression suite**
  Run: `bun test tests/runtime/root-graph.test.ts tests/runtime/root-routing-policy.test.ts tests/runtime/phase-commit.test.ts tests/runtime/approval-gate.test.ts tests/runtime/verifier-feedback-loop.test.ts tests/runtime/interrupt-resume.test.ts tests/app/planner-model.test.ts tests/app/bootstrap.test.ts tests/app/worker-inputs.test.ts tests/infra/model-gateway.test.ts`
  Expected: PASS

- [x] **Step 2: Run typecheck**
  Run: `bun run typecheck`
  Expected: PASS

- [ ] **Step 3: Commit**
  Stage the changed files and commit with a message scoped to rejection resume graph flow.

- [ ] **Step 4: Push and open PR**
  Push the current branch and create a draft PR summarizing the thin coordinator work package flow slices completed on this branch.
