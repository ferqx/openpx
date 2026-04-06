# Agent OS Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-center OpenPX on a stable Agent OS architecture by preserving the runtime/persistence backbone while refactoring kernel contracts, worker lifecycle modeling, stable protocol types, and the TUI state boundary.

**Architecture:** The reset keeps the current local runtime, SQLite stores, tool governance, and LangGraph orchestration. Work proceeds in a strict order: freeze drift, define stable protocol objects, refactor the kernel around those objects, promote workers into first-class runtime entities, then thin the TUI into a protocol consumer.

**Tech Stack:** Bun, TypeScript, Zod, LangGraph.js, React 19, Ink 6, SQLite via `bun:sqlite`

---

## Scope Rules

- Do not start with shell polish work.
- Do not add new architecture-driving fields to runtime responses unless they are part of the stable protocol task.
- Do not redesign persistence storage unless blocked by the reset.
- Do not execute compaction/narrative redesign ahead of protocol and kernel tasks.
- Do not use `any` or `as any`; remove touched-file `any` usage as part of the work.

## Supersession Policy

This is the active implementation plan for the reset.

The following documents are no longer active implementation baselines:

- `docs/superpowers/plans/2026-04-01-langgraph-bun-agent-os-v1.md`
- `docs/superpowers/specs/2026-04-05-tui-optimization-design.md`
- `docs/superpowers/specs/2026-04-05-tui-minimalist-refactor-design.md`
- thread-compaction plan variants as primary implementation drivers

They may be consulted for reuse, but not followed blindly.

## Planned File Map

### Core Specs and Protocol

- Create: `src/runtime/service/protocol/runtime-command-schema.ts`
- Create: `src/runtime/service/protocol/runtime-event-schema.ts`
- Create: `src/runtime/service/protocol/runtime-snapshot-schema.ts`
- Create: `src/runtime/service/protocol/thread-view.ts`
- Create: `src/runtime/service/protocol/task-view.ts`
- Create: `src/runtime/service/protocol/approval-view.ts`
- Create: `src/runtime/service/protocol/answer-view.ts`
- Create: `src/runtime/service/protocol/worker-view.ts`
- Modify: `src/runtime/service/api-schema.ts`
- Modify: `src/runtime/service/runtime-types.ts`

### Kernel Refactor

- Create: `src/kernel/session-command-handler.ts`
- Create: `src/kernel/session-view-projector.ts`
- Create: `src/kernel/session-background-runner.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/kernel/thread-service.ts`
- Modify: `src/kernel/event-bus.ts`

### Worker Lifecycle

- Create: `src/persistence/ports/worker-store-port.ts`
- Create: `src/persistence/sqlite/sqlite-worker-store.ts`
- Modify: `src/control/workers/worker-runtime.ts`
- Modify: `src/control/workers/worker-types.ts`
- Modify: `src/control/workers/worker-manager.ts`
- Modify: `src/app/bootstrap.ts`

### Runtime Service and Commands

- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/runtime/service/runtime-scoped-session.ts`
- Modify: `src/runtime/service/runtime-service.ts`
- Modify: `src/runtime/service/runtime-snapshot.ts`
- Modify: `src/runtime/service/runtime-router.ts`

### TUI Simplification

- Modify: `src/interface/runtime/remote-kernel.ts`
- Modify: `src/interface/runtime/runtime-session.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/tui/components/task-panel.tsx`
- Modify: `src/interface/tui/components/approval-panel.tsx`
- Modify: `src/interface/tui/components/answer-pane.tsx`
- Modify: `src/interface/tui/screen.tsx`

### Validation and Deprecation Cleanup

- Modify: `docs/superpowers/specs/2026-04-03-current-architecture.md`
- Create: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

### Tests

- Create: `tests/runtime/runtime-protocol-schema.test.ts`
- Create: `tests/runtime/worker-lifecycle-protocol.test.ts`
- Create: `tests/kernel/session-command-handler.test.ts`
- Create: `tests/kernel/session-view-projector.test.ts`
- Create: `tests/kernel/session-background-runner.test.ts`
- Modify: `tests/kernel/session-kernel.test.ts`
- Modify: `tests/runtime/runtime-service.test.ts`
- Modify: `tests/runtime/runtime-snapshot.test.ts`
- Modify: `tests/runtime/api-compliance.test.ts`
- Modify: `tests/runtime/kernel-tui-sync.test.ts`
- Modify: `tests/interface/runtime-session.test.ts`
- Modify: `tests/interface/tui-app.test.tsx`

## Phase 0: Freeze Drift

### Task 1: Record the architecture freeze rules

**Files:**
- Modify: `docs/superpowers/specs/2026-04-03-current-architecture.md`
- Create: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

- [ ] **Step 1: Write a failing documentation test equivalent**

Create a checklist in the migration notes with these freeze rules:

```md
- No new TUI-owned business state
- No new protocol `z.any()` for core objects
- No new natural-language resume semantics
- No architecture changes driven solely by shell optimization docs
```

- [ ] **Step 2: Update the current architecture document**

Add a short "Reset In Progress" section that points to:

- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

- [ ] **Step 3: Review the docs for contradictions**

Run:

```bash
rg -n "z.any|yes|no|thinking|minimalist|compaction" docs/superpowers/specs docs/superpowers/plans
```

Expected:

- hits are allowed
- no newly added reset docs contradict the freeze rules

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-03-current-architecture.md docs/superpowers/specs/2026-04-06-agent-os-reset-design.md docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md
git commit -m "docs: establish agent os reset baseline"
```

## Phase 1: Stabilize Runtime Protocol

### Task 2: Create explicit stable view objects

**Files:**
- Create: `src/runtime/service/protocol/thread-view.ts`
- Create: `src/runtime/service/protocol/task-view.ts`
- Create: `src/runtime/service/protocol/approval-view.ts`
- Create: `src/runtime/service/protocol/answer-view.ts`
- Create: `src/runtime/service/protocol/worker-view.ts`
- Create: `tests/runtime/runtime-protocol-schema.test.ts`

- [ ] **Step 1: Write the failing protocol tests**

Cover:

- thread views expose no `z.any()` fields
- task views expose stable lifecycle fields
- worker views expose lifecycle identity fields
- approval views are explicit objects rather than UI-specific summaries

- [ ] **Step 2: Run protocol tests to verify failure**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts
```

Expected: FAIL because protocol modules do not exist.

- [ ] **Step 3: Implement the view modules**

Use explicit Zod schemas and exported inferred types.

Each module should include:

- schema
- inferred type
- zero or more small helper constructors only if necessary

- [ ] **Step 4: Run protocol tests to verify pass**

Run:

```bash
bun test tests/runtime/runtime-protocol-schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/service/protocol tests/runtime/runtime-protocol-schema.test.ts
git commit -m "feat: add stable runtime view schemas"
```

### Task 3: Refactor API schema around stable protocol modules

**Files:**
- Create: `src/runtime/service/protocol/runtime-command-schema.ts`
- Create: `src/runtime/service/protocol/runtime-event-schema.ts`
- Create: `src/runtime/service/protocol/runtime-snapshot-schema.ts`
- Modify: `src/runtime/service/api-schema.ts`
- Modify: `src/runtime/service/runtime-types.ts`
- Modify: `tests/runtime/api-compliance.test.ts`
- Modify: `tests/runtime/runtime-snapshot.test.ts`

- [ ] **Step 1: Write failing API compliance tests**

Add assertions that:

- runtime commands include explicit approval resolution commands
- snapshots embed typed view arrays
- worker views are present in snapshot shape
- no core snapshot field relies on `z.any()`

- [ ] **Step 2: Run focused API tests**

Run:

```bash
bun test tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts
```

Expected: FAIL because schema is still broad.

- [ ] **Step 3: Implement runtime protocol schemas**

Requirements:

- separate command/event/snapshot schema modules
- `api-schema.ts` becomes a composition layer, not the only source of truth
- remove or isolate legacy broad fields

- [ ] **Step 4: Run focused API tests**

Run:

```bash
bun test tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/service/protocol src/runtime/service/api-schema.ts src/runtime/service/runtime-types.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-snapshot.test.ts
git commit -m "feat: stabilize runtime protocol contracts"
```

## Phase 2: Refactor Kernel Contracts

### Task 4: Split command handling, background scheduling, and view projection

**Files:**
- Create: `src/kernel/session-command-handler.ts`
- Create: `src/kernel/session-view-projector.ts`
- Create: `src/kernel/session-background-runner.ts`
- Modify: `src/kernel/session-kernel.ts`
- Create: `tests/kernel/session-command-handler.test.ts`
- Create: `tests/kernel/session-view-projector.test.ts`
- Create: `tests/kernel/session-background-runner.test.ts`
- Modify: `tests/kernel/session-kernel.test.ts`

- [ ] **Step 1: Write failing unit tests for the split responsibilities**

Cover:

- command handler returns stable initial session state after scheduling background work
- background runner invokes control plane and publishes final events
- view projector builds stable view objects without shell-specific assumptions

- [ ] **Step 2: Run kernel-focused tests**

Run:

```bash
bun test tests/kernel/session-command-handler.test.ts tests/kernel/session-view-projector.test.ts tests/kernel/session-background-runner.test.ts tests/kernel/session-kernel.test.ts
```

Expected: FAIL because the new modules do not exist and old kernel shape is different.

- [ ] **Step 3: Implement the new modules**

Rules:

- command arbitration moves into `session-command-handler.ts`
- async execution orchestration moves into `session-background-runner.ts`
- stable projection moves into `session-view-projector.ts`
- `session-kernel.ts` becomes a coordinator rather than a monolith

- [ ] **Step 4: Fix the known hydration timing bug**

The current kernel test failure around immediate hydration after background scheduling must be resolved as part of this refactor.

- [ ] **Step 5: Run kernel-focused tests**

Run:

```bash
bun test tests/kernel/session-command-handler.test.ts tests/kernel/session-view-projector.test.ts tests/kernel/session-background-runner.test.ts tests/kernel/session-kernel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/kernel tests/kernel
git commit -m "refactor: split session kernel responsibilities"
```

### Task 5: Replace natural-language approval resume semantics

**Files:**
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/runtime/graph/root/graph.ts`
- Modify: `src/runtime/graph/root/state.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `tests/runtime/interrupt-resume.test.ts`
- Modify: `tests/control/stateless-resume.test.ts`

- [ ] **Step 1: Write failing resume tests**

Add tests that explicit approval commands resume execution without injecting `"yes"` or `"no"` as user text.

- [ ] **Step 2: Run resume-focused tests**

Run:

```bash
bun test tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
```

Expected: FAIL because current flow still depends on implicit text semantics.

- [ ] **Step 3: Implement explicit resume semantics**

Requirements:

- command objects encode approval decisions
- graph state receives explicit resume control data
- user text remains user text

- [ ] **Step 4: Run resume-focused tests**

Run:

```bash
bun test tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/session-kernel.ts src/runtime/graph/root src/runtime/service/runtime-command-handler.ts tests/runtime/interrupt-resume.test.ts tests/control/stateless-resume.test.ts
git commit -m "refactor: make approval resume explicit"
```

## Phase 3: Promote Workers To First-Class Runtime Entities

### Task 6: Add worker persistence and runtime views

**Files:**
- Create: `src/persistence/ports/worker-store-port.ts`
- Create: `src/persistence/sqlite/sqlite-worker-store.ts`
- Modify: `src/app/bootstrap.ts`
- Create: `tests/runtime/worker-lifecycle-protocol.test.ts`

- [ ] **Step 1: Write failing worker persistence tests**

Cover:

- storing worker lifecycle state
- listing active workers for a thread
- hydrating worker views into runtime snapshots

- [ ] **Step 2: Run worker persistence tests**

Run:

```bash
bun test tests/runtime/worker-lifecycle-protocol.test.ts
```

Expected: FAIL because worker store is missing.

- [ ] **Step 3: Implement worker store port and SQLite adapter**

Use existing store patterns from thread/task stores.

- [ ] **Step 4: Wire the store in bootstrap**

Ensure app context exposes the worker store where needed.

- [ ] **Step 5: Run worker persistence tests**

Run:

```bash
bun test tests/runtime/worker-lifecycle-protocol.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/persistence src/app/bootstrap.ts tests/runtime/worker-lifecycle-protocol.test.ts
git commit -m "feat: persist worker lifecycle state"
```

### Task 7: Expand worker runtime contracts

**Files:**
- Modify: `src/control/workers/worker-runtime.ts`
- Modify: `src/control/workers/worker-types.ts`
- Modify: `src/control/workers/worker-manager.ts`
- Modify: `tests/control/worker-manager.test.ts`
- Modify: `tests/domain/worker-lifecycle.test.ts`

- [ ] **Step 1: Write failing worker lifecycle tests**

Add expectations for:

- start
- inspect
- resume
- cancel
- join

- [ ] **Step 2: Run worker lifecycle tests**

Run:

```bash
bun test tests/control/worker-manager.test.ts tests/domain/worker-lifecycle.test.ts
```

Expected: FAIL because the runtime contract is still minimal.

- [ ] **Step 3: Implement lifecycle-capable worker contracts**

Rules:

- status transitions must be explicit
- worker manager must persist or publish meaningful lifecycle state
- role labels alone are not enough

- [ ] **Step 4: Run worker lifecycle tests**

Run:

```bash
bun test tests/control/worker-manager.test.ts tests/domain/worker-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/control/workers tests/control/worker-manager.test.ts tests/domain/worker-lifecycle.test.ts
git commit -m "feat: promote workers to first-class runtime entities"
```

## Phase 4: Make Runtime Snapshot The Shell Truth

### Task 8: Refactor runtime session derivation around stable views

**Files:**
- Modify: `src/runtime/service/runtime-snapshot.ts`
- Modify: `src/runtime/service/runtime-scoped-session.ts`
- Modify: `src/interface/runtime/runtime-session.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Modify: `tests/runtime/runtime-service.test.ts`
- Modify: `tests/interface/runtime-session.test.ts`

- [ ] **Step 1: Write failing runtime/session derivation tests**

Cover:

- shell hydration from snapshot only
- worker views included in session state
- approvals and answers derived from stable objects rather than ad hoc shape assumptions

- [ ] **Step 2: Run runtime/session tests**

Run:

```bash
bun test tests/runtime/runtime-service.test.ts tests/interface/runtime-session.test.ts
```

Expected: FAIL because session derivation still depends on mixed legacy fields.

- [ ] **Step 3: Implement stable session derivation**

Requirements:

- remote kernel becomes a transport adapter
- runtime session derives from stable protocol objects
- shell-specific convenience conversion happens in one place only

- [ ] **Step 4: Run runtime/session tests**

Run:

```bash
bun test tests/runtime/runtime-service.test.ts tests/interface/runtime-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/service src/interface/runtime tests/runtime/runtime-service.test.ts tests/interface/runtime-session.test.ts
git commit -m "refactor: derive shell session from stable runtime views"
```

## Phase 5: Thin The TUI

### Task 9: Remove TUI-owned business truth

**Files:**
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/tui/components/task-panel.tsx`
- Modify: `src/interface/tui/components/approval-panel.tsx`
- Modify: `src/interface/tui/components/answer-pane.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/runtime/kernel-tui-sync.test.ts`

- [ ] **Step 1: Write failing shell boundary tests**

Add assertions that:

- TUI does not synthesize canonical message history outside stable answer/event objects
- tasks/approvals displayed are derived from runtime view data
- hydration and event replay produce the same visible state

- [ ] **Step 2: Run TUI boundary tests**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/runtime/kernel-tui-sync.test.ts
```

Expected: FAIL because `app.tsx` currently owns too much semantic state.

- [ ] **Step 3: Refactor the TUI**

Rules:

- keep local state only for presentational concerns
- move protocol interpretation out of rendering components
- let interaction stream render stable answer/event data rather than inventing it

- [ ] **Step 4: Run TUI boundary tests**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/runtime/kernel-tui-sync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the broader shell regression suite**

Run:

```bash
bun test tests/interface tests/runtime/kernel-tui-sync.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interface/tui tests/interface tests/runtime/kernel-tui-sync.test.ts
git commit -m "refactor: thin tui into a runtime protocol consumer"
```

## Phase 6: Reposition Auxiliary Systems And Clean Up

### Task 10: Make compaction and narrative strictly auxiliary

**Files:**
- Modify: `src/control/context/thread-state-projector.ts`
- Modify: `src/control/context/thread-compaction-policy.ts`
- Modify: `src/control/context/thread-narrative-service.ts`
- Modify: `tests/control/thread-state-projector.test.ts`
- Modify: `tests/control/thread-compaction-policy.test.ts`
- Modify: `tests/control/thread-narrative-service.test.ts`

- [ ] **Step 1: Write failing auxiliary-boundary tests**

Add tests that prove:

- base thread/task/worker protocol objects remain valid even if compaction is minimal
- narrative projection enriches views but does not define base lifecycle semantics

- [ ] **Step 2: Run auxiliary-boundary tests**

Run:

```bash
bun test tests/control/thread-state-projector.test.ts tests/control/thread-compaction-policy.test.ts tests/control/thread-narrative-service.test.ts
```

Expected: FAIL if auxiliary systems still carry primary lifecycle semantics.

- [ ] **Step 3: Refactor auxiliary systems**

Keep them useful, but subordinate to the stable protocol and kernel lifecycle model.

- [ ] **Step 4: Run auxiliary-boundary tests**

Run:

```bash
bun test tests/control/thread-state-projector.test.ts tests/control/thread-compaction-policy.test.ts tests/control/thread-narrative-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/control/context tests/control
git commit -m "refactor: subordinate compaction and narrative to core protocol"
```

### Task 11: Final validation and superseded cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-04-03-current-architecture.md`
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

- [ ] **Step 1: Run the full suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run planner smoke test**

Run:

```bash
bun run smoke:planner
```

Expected: PASS with model connectivity verified.

- [ ] **Step 4: Update migration notes with final superseded list**

Document:

- removed legacy fields
- removed legacy event semantics
- deprecated docs and their status
- remaining intentional follow-up work

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-03-current-architecture.md docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md
git commit -m "docs: finalize agent os reset migration notes"
```

## Execution Notes

- Prefer focused test runs per task before broad validation.
- Keep each commit scoped to one task or tightly related pair of tasks.
- If worker lifecycle design expands further, split worker persistence and worker control tasks rather than broadening a single commit.
- If runtime protocol changes force shell churn, prefer adapting `runtime-session.ts` first and UI components second.

## Expected End State

At the end of this plan:

- OpenPX still uses its existing runtime backbone
- the runtime protocol is explicit and typed
- kernel responsibilities are separated and testable
- workers are first-class runtime entities
- the TUI is a shell rather than a shadow control plane
- compaction and narrative are retained as support systems, not architecture drivers
