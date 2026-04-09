# Agent OS Reset Batch 1 Execution Brief

Date: 2026-04-06
Status: Working
Related milestone: M1
Roadmap entrypoint: `ROADMAP.md`
Active design:
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this batch task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the first implementation batch of the Agent OS reset by locking the reset baseline, stabilizing runtime protocol schemas, and refactoring the kernel into separated command, background, and projection responsibilities.

**Architecture:** This batch intentionally stops before worker first-class lifecycle work and before TUI thinning. It focuses on the minimum foundation that later phases depend on: stable runtime views, explicit protocol schemas, explicit approval resume semantics, and a non-monolithic kernel.

**Tech Stack:** Bun, TypeScript, Zod, LangGraph.js, React 19, Ink 6, SQLite via `bun:sqlite`

---

## Batch Boundaries

This batch includes only:

- Phase 0: freeze drift
- Phase 1: stable runtime protocol
- Phase 2: kernel contract refactor

This batch explicitly excludes:

- worker persistence and lifecycle promotion
- TUI business-state removal
- compaction/narrative repositioning cleanup

## Why This Batch Exists

If worker and TUI work starts before protocol and kernel stabilization, the reset will fragment immediately. This batch creates the narrow waist of the system:

- typed runtime objects
- explicit control semantics
- stable initial hydration behavior
- kernel decomposition

Everything after this batch should build on those decisions, not rediscover them.

## Critical Success Criteria

Batch 1 is only complete when all of these are true:

- core runtime protocol objects no longer rely on `z.any()`
- runtime commands include explicit control semantics for approval resolution/resume
- `SessionKernel` no longer mixes command arbitration, async scheduling, and view projection in one control path
- the known immediate-hydration failure in `tests/kernel/session-kernel.test.ts` is fixed
- focused runtime and kernel tests pass together

## File Ownership Map

### Protocol ownership

- `src/runtime/service/protocol/thread-view.ts`
  Responsibility: canonical thread view schema and type
- `src/runtime/service/protocol/task-view.ts`
  Responsibility: canonical task view schema and type
- `src/runtime/service/protocol/approval-view.ts`
  Responsibility: canonical approval view schema and type
- `src/runtime/service/protocol/answer-view.ts`
  Responsibility: canonical answer view schema and type
- `src/runtime/service/protocol/worker-view.ts`
  Responsibility: canonical worker view schema and type, even if worker lifecycle implementation lands in batch 2
- `src/runtime/service/protocol/runtime-command-schema.ts`
  Responsibility: runtime command schema authority
- `src/runtime/service/protocol/runtime-event-schema.ts`
  Responsibility: runtime event schema authority
- `src/runtime/service/protocol/runtime-snapshot-schema.ts`
  Responsibility: snapshot schema composed from stable view objects

### Kernel ownership

- `src/kernel/session-command-handler.ts`
  Responsibility: command acceptance, thread selection/creation, command routing
- `src/kernel/session-background-runner.ts`
  Responsibility: background task invocation and completion/error publication
- `src/kernel/session-view-projector.ts`
  Responsibility: stable view assembly from stores and control-plane results
- `src/kernel/session-kernel.ts`
  Responsibility: orchestration only; no direct monolithic ownership of all three concerns

### Graph/control ownership

- `src/runtime/graph/root/graph.ts`
  Responsibility: explicit resume semantics instead of natural-language approval control
- `src/runtime/graph/root/state.ts`
  Responsibility: typed graph resume control fields
- `src/runtime/service/runtime-command-handler.ts`
  Responsibility: runtime command mapping into explicit kernel commands

### Tests

- `tests/runtime/runtime-protocol-schema.test.ts`
- `tests/runtime/api-compliance.test.ts`
- `tests/runtime/runtime-snapshot.test.ts`
- `tests/kernel/session-command-handler.test.ts`
- `tests/kernel/session-background-runner.test.ts`
- `tests/kernel/session-view-projector.test.ts`
- `tests/kernel/session-kernel.test.ts`
- `tests/runtime/interrupt-resume.test.ts`
- `tests/control/stateless-resume.test.ts`

## Execution Order

### Task 1: Freeze and baseline docs

**Files:**
- Modify: `docs/superpowers/specs/2026-04-03-current-architecture.md`
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

- [ ] **Step 1: Confirm reset docs are the active baseline**

Check:

```bash
sed -n '1,120p' docs/superpowers/specs/2026-04-03-current-architecture.md
sed -n '1,200p' docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md
```

Expected:

- reset docs are referenced
- freeze rules are present

- [ ] **Step 2: Scan for obvious architecture drift terms**

Run:

```bash
rg -n "z.any|resumeValue|yes|no|thinking|minimalist|compaction" src docs tests
```

Expected:

- hits are normal
- results give the implementation starting points for later tasks

- [ ] **Step 3: Commit the documentation baseline if not already committed**

```bash
git add docs/superpowers/specs/2026-04-03-current-architecture.md docs/superpowers/specs/2026-04-06-agent-os-reset-design.md docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md docs/superpowers/plans/2026-04-06-agent-os-reset-batch-1.md
git commit -m "docs: define agent os reset execution baseline"
```

### Task 2: Create stable runtime view schemas

**Files:**
- Create: `src/runtime/service/protocol/thread-view.ts`
- Create: `src/runtime/service/protocol/task-view.ts`
- Create: `src/runtime/service/protocol/approval-view.ts`
- Create: `src/runtime/service/protocol/answer-view.ts`
- Create: `src/runtime/service/protocol/worker-view.ts`
- Create: `tests/runtime/runtime-protocol-schema.test.ts`

- [ ] **Step 1: Write the failing test file**

The test should assert:

- each schema parses a minimal valid object
- no schema uses a broad passthrough placeholder for core object shape
- worker view exists even if worker population is minimal in this batch

- [ ] **Step 2: Run the test**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the view schema modules**

Rules:

- use explicit `z.object`
- keep field names aligned with existing domain semantics where reasonable
- avoid UI-specific naming like `title` if the runtime concept is `summary`

- [ ] **Step 4: Re-run the test**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/service/protocol tests/runtime/runtime-protocol-schema.test.ts
git commit -m "feat: add stable runtime protocol view schemas"
```

### Task 3: Rebuild API schema composition around stable modules

**Files:**
- Create: `src/runtime/service/protocol/runtime-command-schema.ts`
- Create: `src/runtime/service/protocol/runtime-event-schema.ts`
- Create: `src/runtime/service/protocol/runtime-snapshot-schema.ts`
- Modify: `src/runtime/service/api-schema.ts`
- Modify: `src/runtime/service/runtime-types.ts`
- Modify: `tests/runtime/api-compliance.test.ts`
- Modify: `tests/runtime/runtime-snapshot.test.ts`

- [ ] **Step 1: Add failing API assertions**

The tests should assert:

- commands include explicit approval decision commands
- snapshot references typed view arrays
- core objects are imported from protocol modules
- no snapshot-level `z.any()` remains for thread/task/approval/answer/worker objects

- [ ] **Step 2: Run the focused tests**

Run:

```bash
bun test tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement protocol composition**

Rules:

- `api-schema.ts` becomes a composition entry point
- `runtime-types.ts` should infer from the protocol schemas, not parallel-declare incompatible types
- if legacy fields must remain temporarily, isolate them away from core object definitions

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
bun test tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/service/protocol src/runtime/service/api-schema.ts src/runtime/service/runtime-types.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts
git commit -m "refactor: compose runtime api from stable protocol schemas"
```

### Task 4: Split the kernel into three responsibilities

**Files:**
- Create: `src/kernel/session-command-handler.ts`
- Create: `src/kernel/session-background-runner.ts`
- Create: `src/kernel/session-view-projector.ts`
- Modify: `src/kernel/session-kernel.ts`
- Create: `tests/kernel/session-command-handler.test.ts`
- Create: `tests/kernel/session-background-runner.test.ts`
- Create: `tests/kernel/session-view-projector.test.ts`
- Modify: `tests/kernel/session-kernel.test.ts`

- [ ] **Step 1: Write failing tests for each new module**

Cover:

- command handler thread arbitration behavior
- background runner completion and error event emission
- view projector assembly from stored thread/task/approval results

- [ ] **Step 2: Run the kernel suite**

Run:

```bash
bun test tests/kernel/session-command-handler.test.ts tests/kernel/session-background-runner.test.ts tests/kernel/session-view-projector.test.ts tests/kernel/session-kernel.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the module split**

Rules:

- no new UI-specific shaping in kernel internals
- background runner owns the async branch currently embedded in `session-kernel.ts`
- projector owns stable result shaping
- kernel coordinates dependencies and public methods only

- [ ] **Step 4: Fix the current hydration race**

The immediate return path after background start must produce a valid stable session result without relying on a fragile timing assumption.

- [ ] **Step 5: Re-run the kernel suite**

Run:

```bash
bun test tests/kernel/session-command-handler.test.ts tests/kernel/session-background-runner.test.ts tests/kernel/session-view-projector.test.ts tests/kernel/session-kernel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/kernel tests/kernel
git commit -m "refactor: split session kernel control responsibilities"
```

### Task 5: Replace implicit `"yes"` resume semantics

**Files:**
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/runtime/graph/root/graph.ts`
- Modify: `src/runtime/graph/root/state.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `tests/runtime/interrupt-resume.test.ts`
- Modify: `tests/control/stateless-resume.test.ts`

- [ ] **Step 1: Add failing approval resume tests**

The tests should assert:

- approval command objects drive resume
- resume control does not masquerade as user text
- graph state consumes explicit control fields

- [ ] **Step 2: Run the resume tests**

Run:

```bash
bun test tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement explicit resume control**

Rules:

- approval resolution is a control action
- user text is not overloaded with system meaning
- the graph should accept typed resume control inputs

- [ ] **Step 4: Re-run the resume tests**

Run:

```bash
bun test tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/session-kernel.ts src/runtime/graph/root/graph.ts src/runtime/graph/root/state.ts src/runtime/service/runtime-command-handler.ts tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
git commit -m "refactor: replace implicit approval text resume"
```

### Task 6: Batch validation gate

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

- [ ] **Step 1: Run the full batch 1 focused suite**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts tests/kernel/session-command-handler.test.ts tests/kernel/session-background-runner.test.ts tests/kernel/session-view-projector.test.ts tests/kernel/session-kernel.test.ts tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Update migration notes**

Record:

- completed batch 1 tasks
- remaining batch 2 dependencies
- any temporary compatibility fields intentionally retained

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md
git commit -m "docs: record agent os reset batch 1 completion"
```

## Risk Register

### Risk 1: Schema churn spills into too many modules

Mitigation:

- create protocol modules first
- adapt `api-schema.ts` second
- adapt downstream code only after schema tests pass

### Risk 2: Kernel split becomes a rename-only refactor

Mitigation:

- demand separate tests per responsibility
- refuse to keep background scheduling logic buried in `session-kernel.ts`

### Risk 3: Approval resume remains chat-shaped by accident

Mitigation:

- write explicit failing tests on command shape and graph input shape
- grep for `"yes"` and `resumeValue` during execution

### Risk 4: Batch expands into worker/TUI work too early

Mitigation:

- stop after batch validation
- do not open worker or TUI tickets in the same execution batch

## Exit Condition

When this batch is done, the project should have a stable runtime contract and a trustworthy kernel foundation. Only then should worker-first-classing and TUI thinning begin.
