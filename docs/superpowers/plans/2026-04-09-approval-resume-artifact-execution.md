# Approval Resume Artifact Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route approved tool executions back through the graph so approval-required work can emit artifacts using the same execution model as non-approved work.

**Architecture:** Keep the existing approval record and policy flow, but stop executing approved tools directly in `approveRequest`. Instead, pass the `approvalRequestId` back through resume control, let the interrupted executor resolve and run the approved tool inside the graph, and reuse artifact-building helpers for compact `latestArtifacts`. Leave rejection flow unchanged in this slice.

**Tech Stack:** TypeScript, Bun test, LangGraph.js

---

### Task 1: Lock Approved Execution Helper Semantics

**Files:**
- Modify: `src/app/worker-inputs.ts`
- Test: `tests/app/worker-inputs.test.ts`

- [ ] **Step 1: Write the failing helper tests**
  Add coverage for deriving artifact records from approved tool requests with workspace-relative refs.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test tests/app/worker-inputs.test.ts`
  Expected: FAIL because approval-specific artifact helper does not exist yet.

- [ ] **Step 3: Implement the minimal helper**
  Add a helper that converts an approved tool request plus summary into `latestArtifacts`.

- [ ] **Step 4: Re-run tests**
  Run: `bun test tests/app/worker-inputs.test.ts`
  Expected: PASS

### Task 2: Execute Approved Tools Inside The Graph

**Files:**
- Modify: `src/runtime/graph/root/resume-control.ts`
- Modify: `src/app/bootstrap.ts`
- Test: `tests/app/bootstrap.test.ts`

- [ ] **Step 1: Extend approval integration tests**
  Tighten `approveRequest` coverage so the approved path still creates the file and returns the graph-driven summary.

- [ ] **Step 2: Run tests to verify current behavior gap**
  Run: `bun test tests/app/bootstrap.test.ts`
  Expected: FAIL only if the new expectations require graph-resume-specific behavior.

- [ ] **Step 3: Extend resume control**
  Add `approvalRequestId` to approval resume payloads.

- [ ] **Step 4: Handle approved resume inside executor**
  Capture the resume value from `interrupt`, resolve the approved tool request, execute it via `executeApproved`, and return `latestArtifacts`.

- [ ] **Step 5: Switch `approveRequest` to resume the graph**
  Update approval status first, then call back into `startRootTask` with the approval resume control instead of executing the tool directly.

- [ ] **Step 6: Re-run tests**
  Run: `bun test tests/app/bootstrap.test.ts`
  Expected: PASS

### Task 3: Verify Regression Boundary

**Files:**
- Modify: tests only if type drift appears

- [ ] **Step 1: Run focused regression suite**
  Run: `bun test tests/runtime/root-graph.test.ts tests/runtime/root-routing-policy.test.ts tests/runtime/phase-commit.test.ts tests/runtime/approval-gate.test.ts tests/runtime/verifier-feedback-loop.test.ts tests/runtime/interrupt-resume.test.ts tests/app/planner-model.test.ts tests/app/bootstrap.test.ts tests/app/worker-inputs.test.ts tests/infra/model-gateway.test.ts`
  Expected: PASS

- [ ] **Step 2: Run typecheck**
  Run: `bun run typecheck`
  Expected: PASS

- [ ] **Step 3: Commit**
  Stage the changed files and commit with a message scoped to approval-resume artifact execution.
