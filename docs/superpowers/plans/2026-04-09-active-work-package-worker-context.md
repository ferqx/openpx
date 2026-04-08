# Active Work Package Worker Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure executor and verifier consume the active work package context instead of relying only on the raw user request.

**Architecture:** Persist planner metadata in root state, derive the active work package at executor/verifier dispatch time, and pass structured context into worker handlers. Keep routing behavior unchanged; only worker inputs and app-layer prompt construction should change. Use focused tests to pin the new context contract and the app-layer prompt/summary behavior.

**Tech Stack:** TypeScript, Bun test, LangGraph.js, Zod

---

### Task 1: Preserve Planner Metadata In Root State

**Files:**
- Modify: `src/runtime/graph/root/context.ts`
- Modify: `src/runtime/graph/root/state.ts`
- Modify: `src/runtime/workers/planner/graph.ts`
- Modify: `src/runtime/graph/root/graph.ts`
- Test: `tests/runtime/root-graph.test.ts`

- [ ] **Step 1: Write the failing root-graph tests**
  Add assertions that executor and verifier receive the active `workPackage`, planner metadata, and committed artifacts.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test tests/runtime/root-graph.test.ts`
  Expected: FAIL because worker execution context does not yet include active work package metadata.

- [ ] **Step 3: Implement root-state propagation**
  Add `plannerResult` to worker/root state and preserve it through the planner worker graph.

- [ ] **Step 4: Implement derived worker context**
  Update root graph executor/verifier dispatch to include the active work package and planner metadata.

- [ ] **Step 5: Re-run tests**
  Run: `bun test tests/runtime/root-graph.test.ts`
  Expected: PASS

### Task 2: Build App Worker Inputs From Active Work Package

**Files:**
- Modify: `src/app/bootstrap.ts`
- Create or Modify: helper module only if needed for prompt formatting
- Test: `tests/app/planner-model.test.ts`
- Test: `tests/app/bootstrap.test.ts` or a focused new test file

- [ ] **Step 1: Write the failing app tests**
  Add coverage proving executor uses the active work package objective and verifier prompt includes artifact and verification scope context.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `bun test tests/app/planner-model.test.ts tests/app/bootstrap.test.ts`
  Expected: FAIL on stale raw-input behavior.

- [ ] **Step 3: Implement minimal app changes**
  Use `currentWorkPackage.objective` as the primary execution target and build verifier prompt text from `currentWorkPackage`, committed artifacts, and `plannerResult.verificationScope`.

- [ ] **Step 4: Re-run tests**
  Run: `bun test tests/app/planner-model.test.ts tests/app/bootstrap.test.ts`
  Expected: PASS

### Task 3: Tighten Types And Verify End-To-End Slice

**Files:**
- Modify: nearby root-routing / approval tests only if type drift appears
- Test: `tests/runtime/root-routing-policy.test.ts`
- Test: `tests/runtime/approval-gate.test.ts`

- [ ] **Step 1: Run focused regression suite**
  Run: `bun test tests/runtime/root-graph.test.ts tests/runtime/root-routing-policy.test.ts tests/runtime/approval-gate.test.ts tests/app/planner-model.test.ts tests/app/bootstrap.test.ts tests/infra/model-gateway.test.ts`
  Expected: PASS

- [ ] **Step 2: Run typecheck**
  Run: `bun run typecheck`
  Expected: PASS

- [ ] **Step 3: Commit**
  Stage the changed files and commit with a message scoped to active work package context propagation.
