# Agent OS Tail Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining Agent OS convergence work by removing the last ambiguous UI/kernel/runtime boundaries without reopening core architecture drift.

**Architecture:** The runtime protocol, kernel event bus, durable event boundary, and worker lifecycle are already in place. This tail plan only addresses the remaining mixed contracts: `thread.view_updated` dual meaning, broad kernel return typing in the TUI, residual UI-owned derived state, and missing written rules for durable/kernel/runtime event layering.

**Tech Stack:** Bun, TypeScript, Zod, React 19, Ink 6, SQLite, LangGraph.js

---

## Scope Rules

- Do not add new user-facing features while executing this plan.
- Do not redesign stores, daemon lifecycle, or worker persistence.
- Do not add new broad event envelopes or fallback `unknown` branches to core UI flows.
- Do not reintroduce `any` or `as any`; touched files must stay compliant with project policy.
- Keep each task small and independently verifiable.

## Planned File Map

### TUI Event Contract

- Modify: `src/interface/tui/hooks/use-kernel.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Modify: `tests/interface/remote-kernel.test.ts`
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/interface/runtime-session.test.ts`

### Kernel Result Contract

- Create: `src/interface/runtime/tui-session-event.ts`
- Modify: `src/kernel/session-view-projector.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `tests/kernel/session-view-projector.test.ts`
- Modify: `tests/interface/tui-app.test.tsx`

### TUI Local-State Reduction

- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `tests/interface/tui-app.test.tsx`

### Event Layering Documentation

- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`
- Modify: `docs/superpowers/specs/2026-04-03-current-architecture.md`

## Task 1: Single-Meaning TUI Session Update Event

**Files:**
- Create: `src/interface/runtime/tui-session-event.ts`
- Modify: `src/interface/tui/hooks/use-kernel.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Modify: `src/interface/runtime/runtime-session.ts`
- Test: `tests/interface/remote-kernel.test.ts`
- Test: `tests/interface/runtime-session.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- hydration emits a TUI-specific session update event instead of overloading `thread.view_updated`
- remote replayed runtime events remain stable protocol events
- the TUI session update event payload is exactly `RuntimeSessionState`

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/remote-kernel.test.ts tests/interface/runtime-session.test.ts
```

Expected: FAIL because hydration still reuses `thread.view_updated`.

- [ ] **Step 3: Implement the session update event contract**

Create a dedicated TUI event type, for example:

- `type: "session.updated"`

Route hydration and command-result session refresh through that event only. Keep runtime SSE events untouched.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/remote-kernel.test.ts tests/interface/runtime-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/runtime/tui-session-event.ts src/interface/tui/hooks/use-kernel.ts src/interface/runtime/remote-kernel.ts src/interface/runtime/runtime-session.ts tests/interface/remote-kernel.test.ts tests/interface/runtime-session.test.ts
git commit -m "refactor: separate tui session updates from runtime events"
```

## Task 2: Remove Broad `isKernelResult(...)` Flow From TUI

**Files:**
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/hooks/use-kernel.ts`
- Modify: `src/kernel/session-view-projector.ts`
- Modify: `src/kernel/session-kernel.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/kernel/session-view-projector.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- `handleCommand(...)` returns a typed TUI session result without runtime shape guessing
- `hydrateSession()` returns the same typed shape
- `App` can consume command/hydrate results without calling a broad unknown-object guard

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/kernel/session-view-projector.test.ts
```

Expected: FAIL because `App` still depends on `isKernelResult(...)`.

- [ ] **Step 3: Implement the shared result type**

Define a single TUI-facing session result type and use it in:

- kernel projection return values
- `TuiKernel.handleCommand(...)`
- `TuiKernel.hydrateSession(...)`
- `App.applyKernelResult(...)`

Delete `isKernelResult(...)` after the type is fully wired.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/kernel/session-view-projector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/app.tsx src/interface/tui/hooks/use-kernel.ts src/kernel/session-view-projector.ts src/kernel/session-kernel.ts tests/interface/tui-app.test.tsx tests/kernel/session-view-projector.test.ts
git commit -m "refactor: type tui kernel results end to end"
```

## Task 3: Reduce Remaining TUI-Owned Derived State

**Files:**
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- assistant summary rendering prefers the unified session result over event-by-event message reconstruction where possible
- narrative fallback still works when no fresh answer exists
- purely visual state still behaves the same: composer mode, thinking indicator, thread panel visibility

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/tui-app.test.tsx
```

Expected: FAIL once assertions cover the remaining locally derived behavior.

- [x] **Step 3: Implement the minimal state reduction**

Keep only:

- user input messages
- active transient thinking content
- ephemeral timing/performance state
- panel toggles

Move any state that can be read from the latest session object out of local business reconstruction.

- [x] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/app.tsx src/interface/tui/components/interaction-stream.tsx src/interface/tui/screen.tsx tests/interface/tui-app.test.tsx
git commit -m "refactor: reduce tui-owned derived business state"
```

## Task 4: Write the Durable/Kernel/Runtime Event Layering Rules

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`
- Modify: `docs/superpowers/specs/2026-04-03-current-architecture.md`

- [x] **Step 1: Write the documentation checklist**

Document three explicit layers:

- durable event: persisted recovery/narrative support only
- kernel event: in-process coordination event
- runtime event: stable external protocol event

- [x] **Step 2: Add mapping rules**

Document which categories are allowed in each layer and which are forbidden. Include examples:

- `stream.*` is runtime-only, not durable
- `task.created` can be durable and externally projected
- TUI hydration updates are not runtime SSE events

- [x] **Step 3: Review the docs for contradictions**

Run:

```bash
rg -n "thread.view_updated|stream\\.|durable event|kernel event|runtime event" docs/superpowers/specs docs/superpowers/plans
```

Expected:

- reset docs describe one consistent layering model
- no surviving doc claims that `stream.*` belongs in durable storage

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-agent-os-reset-design.md docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md docs/superpowers/specs/2026-04-03-current-architecture.md docs/superpowers/plans/2026-04-06-agent-os-tail-plan.md
git commit -m "docs: define agent os tail convergence rules"
```

## Task 5: Final Verification Sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md`

- [x] **Step 1: Run focused interface and runtime checks**

Run:

```bash
bun test tests/interface tests/runtime/kernel-tui-sync.test.ts tests/runtime/runtime-protocol-schema.test.ts
```

Expected: PASS.

- [x] **Step 2: Run full typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [x] **Step 3: Run full suite**

Run:

```bash
bun test
```

Expected: PASS.

- [x] **Step 4: Update migration notes with completion status**

Record:

- which tail tasks completed
- any intentionally deferred follow-up
- whether `thread.view_updated` ambiguity is gone

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-agent-os-reset-migration-notes.md
git commit -m "chore: verify tail convergence completion"
```

## Completion Criteria

- The TUI no longer overloads `thread.view_updated` for both hydration and runtime updates.
- `TuiKernel.handleCommand(...)` and `hydrateSession()` return a single typed contract.
- `App` no longer uses a broad `isKernelResult(...)` guard for the primary UI flow.
- Remaining local UI state is limited to presentation-only concerns.
- Durable, kernel, and runtime event layers are explicitly documented and consistent with code.
- `bun run typecheck` and `bun test` both pass at the end of the plan.
