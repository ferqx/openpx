# Current Package Artifact Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make artifact and verification flow work-package scoped so executor emits stable artifacts, routing looks only at the active package, and phase commits clear stale state before moving on.

**Architecture:** Keep the thin coordinator structure intact, but tighten state semantics around `artifacts`, `latestArtifacts`, and `verificationReport`. Executor returns compact artifact records for the active package, route decisions filter artifacts by `currentWorkPackageId`, and phase commit merges committed artifacts while clearing transient package-local state before the next package starts.

**Tech Stack:** TypeScript, Bun test, LangGraph.js, Zod

---

### Task 1: Lock Current-Package Routing Semantics

**Files:**
- Modify: `src/runtime/graph/root/root-routing-policy.ts`
- Modify: `src/runtime/graph/root/nodes/phase-commit.ts`
- Test: `tests/runtime/root-routing-policy.test.ts`
- Test: `tests/runtime/phase-commit.test.ts`

- [ ] **Step 1: Write the failing routing and phase-commit tests**
  Add coverage for previous-package artifacts not satisfying the current package, and for phase commit clearing transient verification state before the next package.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test tests/runtime/root-routing-policy.test.ts tests/runtime/phase-commit.test.ts`
  Expected: FAIL on stale global artifact / verification semantics.

- [ ] **Step 3: Implement package-scoped routing**
  Filter artifacts by `currentWorkPackageId` before deciding executor vs verifier vs finish.

- [ ] **Step 4: Implement phase-commit cleanup**
  Merge `latestArtifacts` into committed `artifacts`, then clear `latestArtifacts`, `verificationReport`, and any other package-local transient state before advancing.

- [ ] **Step 5: Re-run tests**
  Run: `bun test tests/runtime/root-routing-policy.test.ts tests/runtime/phase-commit.test.ts`
  Expected: PASS

### Task 2: Make Executor Emit Stable Artifacts

**Files:**
- Modify: `src/app/worker-inputs.ts`
- Modify: `src/app/bootstrap.ts`
- Test: `tests/app/worker-inputs.test.ts`
- Test: `tests/app/planner-model.test.ts`

- [ ] **Step 1: Write the failing executor artifact tests**
  Add coverage for creating compact artifact records from the active work package objective and for delete execution producing a deterministic artifact ref.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test tests/app/worker-inputs.test.ts tests/app/planner-model.test.ts`
  Expected: FAIL because executor only returns summary strings.

- [ ] **Step 3: Implement minimal artifact builders**
  Add helper(s) that map the current work package plus execution outcome into `latestArtifacts`.

- [ ] **Step 4: Return `latestArtifacts` from executor**
  Update bootstrap executor paths to emit compact artifact records for both generic and delete execution outcomes.

- [ ] **Step 5: Re-run tests**
  Run: `bun test tests/app/worker-inputs.test.ts tests/app/planner-model.test.ts`
  Expected: PASS

### Task 3: Verify Integrated Artifact Flow

**Files:**
- Modify: `tests/runtime/root-graph.test.ts`

- [ ] **Step 1: Add an integrated root-graph test**
  Verify that executor-produced `latestArtifacts` flow through verifier and are committed by phase commit without leaking into the next package's routing state.

- [ ] **Step 2: Run focused integration tests**
  Run: `bun test tests/runtime/root-graph.test.ts`
  Expected: PASS

- [ ] **Step 3: Run regression suite**
  Run: `bun test tests/runtime/root-graph.test.ts tests/runtime/root-routing-policy.test.ts tests/runtime/phase-commit.test.ts tests/runtime/approval-gate.test.ts tests/runtime/verifier-feedback-loop.test.ts tests/app/planner-model.test.ts tests/app/bootstrap.test.ts tests/app/worker-inputs.test.ts tests/infra/model-gateway.test.ts`
  Expected: PASS

- [ ] **Step 4: Run typecheck**
  Run: `bun run typecheck`
  Expected: PASS

- [ ] **Step 5: Commit**
  Stage the changed files and commit with a message scoped to current-package artifact flow.
