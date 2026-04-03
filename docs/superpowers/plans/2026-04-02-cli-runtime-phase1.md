# CLI Runtime Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current CLI-first code agent into a shared local runtime with long-lived thread semantics, durable recovery, stabilized model integration, and a clearer work-shell UX.

**Architecture:** Phase 1 keeps Bun + TypeScript and the existing domain/control/runtime layers, but inserts a real shared runtime service boundary between the CLI/TUI and the agent kernel. The work is sequenced so the state contract, replay semantics, and side-effect recovery model are defined before long-running runtime behavior is broadened.

**Tech Stack:** Bun, TypeScript, `@langchain/langgraph`, `@langchain/openai`, `bun:sqlite`, React, Ink, SSE over local HTTP, existing SQLite persistence

---

## Planned File Map

### Identity and Lifecycle Prerequisites

- Modify: `src/domain/thread.ts`
- Modify: `src/domain/task.ts`
- Modify: `src/domain/worker.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/persistence/ports/thread-store-port.ts`
- Modify: `src/persistence/sqlite/sqlite-thread-store.ts`
- Modify: `src/persistence/sqlite/sqlite-migrator.ts`
- Create: `tests/domain/thread-lifecycle.test.ts`
- Create: `tests/domain/worker-lifecycle.test.ts`
- Create: `tests/persistence/sqlite-thread-store-scope.test.ts`

### Runtime Service and Protocol

- Create: `src/runtime/service/runtime-service.ts`
- Create: `src/runtime/service/runtime-daemon.ts`
- Create: `src/runtime/service/runtime-http-server.ts`
- Create: `src/runtime/service/runtime-router.ts`
- Create: `src/runtime/service/runtime-events.ts`
- Create: `src/runtime/service/runtime-snapshot.ts`
- Create: `src/runtime/service/runtime-command-handler.ts`
- Create: `src/runtime/service/runtime-types.ts`
- Create: `src/interface/runtime/runtime-client.ts`
- Create: `tests/runtime/runtime-service.test.ts`
- Create: `tests/runtime/runtime-http-server.test.ts`
- Create: `tests/interface/runtime-client-reconnect.test.ts`

### Thread Semantics and Arbitration

- Create: `src/kernel/thread-registry.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/kernel/thread-service.ts`
- Modify: `src/persistence/ports/thread-store-port.ts`
- Modify: `src/persistence/sqlite/sqlite-thread-store.ts`
- Create: `tests/kernel/thread-registry.test.ts`
- Create: `tests/runtime/thread-arbitration.test.ts`

### Snapshot Replay and Event Continuity

- Modify: `src/persistence/ports/event-log-port.ts`
- Modify: `src/persistence/sqlite/sqlite-event-log.ts`
- Modify: `src/runtime/service/runtime-snapshot.ts`
- Modify: `src/runtime/service/runtime-events.ts`
- Modify: `src/interface/runtime/runtime-client.ts`
- Create: `tests/runtime/hydrate-replay.test.ts`
- Create: `tests/interface/runtime-client-reconnect.test.ts`
- Create: `tests/runtime/runtime-restart-recovery.test.ts`

### Context Discipline

- Create: `src/control/context/thread-narrative-service.ts`
- Create: `src/control/context/task-working-state.ts`
- Create: `src/control/context/worker-scratch-policy.ts`
- Modify: `src/runtime/graph/root/state.ts`
- Modify: `src/app/bootstrap.ts`
- Create: `tests/control/thread-narrative-service.test.ts`
- Create: `tests/control/worker-scratch-policy.test.ts`
- Create: `tests/control/context-compression.test.ts`

### Execution Ledger and Recovery

- Create: `src/persistence/ports/execution-ledger-port.ts`
- Create: `src/persistence/sqlite/sqlite-execution-ledger.ts`
- Modify: `src/persistence/sqlite/sqlite-migrator.ts`
- Modify: `src/control/tools/tool-types.ts`
- Modify: `src/control/tools/tool-registry.ts`
- Modify: `src/app/bootstrap.ts`
- Create: `tests/persistence/sqlite-execution-ledger.test.ts`
- Create: `tests/runtime/execution-ledger-recovery.test.ts`
- Create: `tests/runtime/runtime-restart-recovery.test.ts`

### ModelGateway and Verifier

- Modify: `src/infra/model-gateway.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/runtime/workers/verifier/graph.ts`
- Create: `tests/infra/model-gateway-errors.test.ts`
- Create: `tests/app/verifier-model.test.ts`

### CLI/TUI Work Shell

- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/commands.ts`
- Modify: `src/interface/tui/components/task-panel.tsx`
- Modify: `src/interface/tui/components/approval-panel.tsx`
- Create: `src/interface/tui/components/status-bar.tsx`
- Create: `tests/interface/tui-status-shell.test.tsx`

### Agent Team Policy

- Create: `src/control/workers/team-policy.ts`
- Create: `src/control/workers/team-confirmation.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/interface/tui/app.tsx`
- Create: `tests/control/team-policy.test.ts`
- Create: `tests/interface/team-confirmation.test.tsx`

## Task 0: Add Scoped Thread Identity and Lifecycle Prerequisites

**Files:**
- Modify: `src/domain/thread.ts`
- Modify: `src/domain/task.ts`
- Modify: `src/domain/worker.ts`
- Modify: `src/shared/schemas.ts`
- Modify: `src/persistence/ports/thread-store-port.ts`
- Modify: `src/persistence/sqlite/sqlite-thread-store.ts`
- Modify: `src/persistence/sqlite/sqlite-migrator.ts`
- Test: `tests/domain/thread-lifecycle.test.ts`
- Test: `tests/domain/worker-lifecycle.test.ts`
- Test: `tests/persistence/sqlite-thread-store-scope.test.ts`

- [ ] **Step 1: Write failing tests for scoped thread identity and updated lifecycle states**

```ts
test("persists workspaceRoot, projectId, revision, and blocked status for a thread", async () => {
  // save thread, reload it, and assert scoped identity plus monotonic revision
});

test("allows worker pause, complete, and cancel lifecycle transitions", () => {
  // assert worker transition table matches the Phase 1 lifecycle contract
});

test("persists human-required recovery as blocked task metadata instead of a terminal failure", async () => {
  // assert task status is blocked and blockingReason.kind === "human_recovery"
});
```

- [ ] **Step 2: Run the lifecycle and scope tests to verify failure**

Run:

```bash
bun test tests/domain/thread-lifecycle.test.ts tests/domain/worker-lifecycle.test.ts tests/persistence/sqlite-thread-store-scope.test.ts
```

Expected: FAIL because thread records are not yet scoped by workspace/project, revisions are not durable, and the lifecycle schemas do not yet model `blocked` or the updated worker state machine.

- [ ] **Step 3: Implement the minimum identity and lifecycle model**

Implement:

- thread fields for `workspaceRoot`, `projectId`, `revision`, and statuses that include `blocked`
- task/thread roll-up rules so non-approval blocking and crash-uncertain recovery can surface without being misclassified as failure
- a concrete recovery contract: uncertain side effects persist as `task.status = "blocked"` with `blockingReason.kind = "human_recovery"` and ledger metadata, and thread roll-up surfaces that task as `thread.status = "blocked"`
- worker statuses aligned to the roadmap contract: `created`, `starting`, `running`, `paused`, `completed`, `failed`, `cancelled`
- SQLite thread-store persistence and queries keyed by workspace/project scope, including latest-thread lookup within that scope
- migrator updates so existing local data is upgraded rather than discarded

- [ ] **Step 4: Run the prerequisite tests plus existing domain regressions**

Run:

```bash
bun test tests/domain/thread-lifecycle.test.ts tests/domain/worker-lifecycle.test.ts tests/persistence/sqlite-thread-store-scope.test.ts tests/domain/thread.test.ts tests/domain/task.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the prerequisite model changes**

```bash
git add src/domain/thread.ts src/domain/task.ts src/domain/worker.ts src/shared/schemas.ts src/persistence/ports/thread-store-port.ts src/persistence/sqlite/sqlite-thread-store.ts src/persistence/sqlite/sqlite-migrator.ts tests/domain/thread-lifecycle.test.ts tests/domain/worker-lifecycle.test.ts tests/persistence/sqlite-thread-store-scope.test.ts
git commit -m "feat: add scoped thread identity and lifecycle prerequisites"
```

## Task 1: Introduce the Shared Runtime Service Skeleton

**Files:**
- Create: `src/runtime/service/runtime-service.ts`
- Create: `src/runtime/service/runtime-daemon.ts`
- Create: `src/runtime/service/runtime-http-server.ts`
- Create: `src/runtime/service/runtime-router.ts`
- Create: `src/runtime/service/runtime-events.ts`
- Create: `src/runtime/service/runtime-snapshot.ts`
- Create: `src/runtime/service/runtime-command-handler.ts`
- Create: `src/runtime/service/runtime-types.ts`
- Create: `src/interface/runtime/runtime-client.ts`
- Modify: `src/app/main.ts`
- Test: `tests/runtime/runtime-service.test.ts`
- Test: `tests/runtime/runtime-http-server.test.ts`
- Test: `tests/interface/runtime-client-reconnect.test.ts`

- [ ] **Step 1: Write the failing runtime service contract tests**

```ts
import { describe, expect, test } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";

describe("RuntimeService", () => {
  test("hydrates current thread state and exposes a replay cursor", async () => {
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: "/tmp/runtime-workspace" });
    const snapshot = await runtime.getSnapshot();

    expect(snapshot.protocolVersion).toBeString();
    expect(snapshot.workspaceRoot).toBeString();
    expect(snapshot.projectId).toBeString();
    expect(snapshot.lastEventSeq).toBeNumber();
    expect(snapshot.activeThreadId).toBeString();
    expect(snapshot.threads).toBeArray();
    expect(snapshot.tasks).toBeArray();
    expect(snapshot.pendingApprovals).toBeArray();
    expect(snapshot.answers).toBeArray();
  });

  test("starts one device runtime daemon and lets reconnecting clients reuse it across workspaces", async () => {
    // boot one client, capture the endpoint, attach a second client from another workspace context, and assert both see the same runtime process
  });
});
```

- [ ] **Step 2: Run the service tests to verify they fail**

Run:

```bash
bun test tests/runtime/runtime-service.test.ts tests/runtime/runtime-http-server.test.ts tests/interface/runtime-client-reconnect.test.ts
```

Expected: FAIL because the runtime service files do not exist yet.

- [ ] **Step 3: Implement the minimal runtime service and client boundary**

Implement:

- a `createRuntimeService(...)` entrypoint that wraps the current kernel/bootstrap state
- a device-scoped local runtime daemon entrypoint that binds to loopback only and persists beyond a single CLI render cycle
- client discovery/attachment logic that prefers an already-running device runtime before spawning a new daemon
- single-instance coordination via a device-level lockfile or endpoint registry so competing CLI launches do not create duplicate runtimes
- an attach contract where the client supplies `{ workspaceRoot, projectId }`, the runtime resolves the scoped active thread for that project, and lazily creates the first thread when that project has no history yet
- an HTTP server exposing `GET /snapshot` and `POST /commands`
- an SSE endpoint exposing `/events?after=<seq>`
- a versioned snapshot contract and versioned stream envelope used by the runtime client
- snapshot payloads with the concrete shape `{ protocolVersion, workspaceRoot, projectId, lastEventSeq, activeThreadId, threads, tasks, pendingApprovals, answers }` so reconnecting clients can fully hydrate before streaming
- a `runtime-client` used by `src/app/main.ts` instead of directly binding TUI to the kernel

- [ ] **Step 4: Run the new runtime tests and existing entrypoint tests**

Run:

```bash
bun test tests/runtime/runtime-service.test.ts tests/runtime/runtime-http-server.test.ts tests/interface/runtime-client-reconnect.test.ts tests/app/main-entrypoint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the runtime skeleton**

```bash
git add src/runtime/service src/interface/runtime src/app/main.ts tests/runtime/runtime-service.test.ts tests/runtime/runtime-http-server.test.ts tests/interface/runtime-client-reconnect.test.ts
git commit -m "feat: add shared runtime service skeleton"
```

## Task 2: Establish Long-Lived Thread Selection and Revision-Checked Commands

**Files:**
- Create: `src/kernel/thread-registry.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/kernel/thread-service.ts`
- Modify: `src/persistence/ports/thread-store-port.ts`
- Modify: `src/persistence/sqlite/sqlite-thread-store.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/runtime/service/runtime-snapshot.ts`
- Test: `tests/kernel/thread-registry.test.ts`
- Test: `tests/runtime/thread-arbitration.test.ts`

- [ ] **Step 1: Write failing tests for recent-thread selection and stale command rejection**

```ts
test("returns the most recently active thread for a project", async () => {
  // save two threads, mark one newer, expect the newer one as default
});

test("rejects a mutation against a stale thread revision", async () => {
  // send command with revision 3 when runtime is at revision 4
});

test("keeps a blocked thread as the default continuation target until the user explicitly switches", async () => {
  // create blocked and completed threads in one project, expect the blocked one to remain the default target
});

test("lists, creates, and switches threads without silently replacing the active long-lived thread", async () => {
  // exercise runtime commands for list/new/switch and assert selected thread id changes only on explicit command
});
```

- [ ] **Step 2: Run the thread tests to verify failure**

Run:

```bash
bun test tests/kernel/thread-registry.test.ts tests/runtime/thread-arbitration.test.ts
```

Expected: FAIL because the registry and revision checks are missing.

- [ ] **Step 3: Implement the minimal registry and revision model**

Implement:

- recent-thread lookup by workspace/project
- per-thread monotonic revision increments on every state-changing command
- command handlers that require the caller’s known revision for state mutation
- explicit stale-command rejection path
- runtime commands for thread list/create/switch/continue, where `continue` reattaches to the scoped active thread without forcing a new thread
- attach-time scoped thread resolution based on `{ workspaceRoot, projectId }`
- default continuation logic that prefers the current blocked or interrupted thread instead of silently creating a replacement

- [ ] **Step 4: Re-run thread tests plus existing kernel/thread tests**

Run:

```bash
bun test tests/kernel/thread-registry.test.ts tests/runtime/thread-arbitration.test.ts tests/kernel/session-kernel.test.ts tests/persistence/sqlite-thread-store-scope.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the thread semantics work**

```bash
git add src/kernel/thread-registry.ts src/kernel/session-kernel.ts src/kernel/thread-service.ts src/persistence/ports/thread-store-port.ts src/persistence/sqlite/sqlite-thread-store.ts src/runtime/service/runtime-command-handler.ts src/runtime/service/runtime-snapshot.ts tests/kernel/thread-registry.test.ts tests/runtime/thread-arbitration.test.ts
git commit -m "feat: add long-lived thread selection and revision checks"
```

## Task 3: Make Snapshot Hydration and Event Streaming Replay-Safe

**Files:**
- Modify: `src/persistence/ports/event-log-port.ts`
- Modify: `src/persistence/sqlite/sqlite-event-log.ts`
- Modify: `src/runtime/service/runtime-events.ts`
- Modify: `src/runtime/service/runtime-snapshot.ts`
- Modify: `src/interface/runtime/runtime-client.ts`
- Test: `tests/runtime/hydrate-replay.test.ts`
- Test: `tests/interface/runtime-client-reconnect.test.ts`
- Test: `tests/runtime/runtime-restart-recovery.test.ts`

- [ ] **Step 1: Write failing tests for hydrate-to-stream continuity, versioning, and reconnect**

```ts
test("replays events after the snapshot cursor without gaps", async () => {
  // take snapshot at seq N, append event N+1, subscribe from N+1, expect event
});

test("rejects stale replay cursors with a rehydrate-required error", async () => {
  // request an expired cursor and assert the client is told to rehydrate
});

test("fails fast when snapshot and stream protocol versions do not match", async () => {
  // simulate version mismatch and assert reconnect is refused until rehydrate
});
```

- [ ] **Step 2: Run the replay test to verify failure**

Run:

```bash
bun test tests/runtime/hydrate-replay.test.ts
```

Expected: FAIL because replay cursors or event slicing are not implemented yet.

- [ ] **Step 3: Implement replay cursor semantics**

Implement:

- `last_event_seq` in snapshots
- `protocol_version` in snapshots and stream envelopes
- `listByThreadAfter(threadId, seq)` or equivalent on the event log
- SSE replay from `after=<seq>`
- a bounded replay window with clear error behavior if the cursor is too old
- runtime-client reconnect behavior that resumes from `last_event_seq + 1` when possible and rehydrates the full `{ workspaceRoot, projectId, activeThreadId, threads, tasks, pendingApprovals, answers }` snapshot when replay continuity cannot be guaranteed
- daemon restart recovery that reloads the existing checkpoint/resume state, snapshot, and replay cursor so a fresh runtime process can resume serving the same thread/task/approval truth

- [ ] **Step 4: Re-run replay and runtime HTTP tests**

Run:

```bash
bun test tests/runtime/hydrate-replay.test.ts tests/runtime/runtime-http-server.test.ts tests/interface/runtime-client-reconnect.test.ts tests/runtime/runtime-restart-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit replay-safe hydration**

```bash
git add src/persistence/ports/event-log-port.ts src/persistence/sqlite/sqlite-event-log.ts src/runtime/service/runtime-events.ts src/runtime/service/runtime-snapshot.ts src/interface/runtime/runtime-client.ts tests/runtime/hydrate-replay.test.ts tests/interface/runtime-client-reconnect.test.ts tests/runtime/runtime-restart-recovery.test.ts
git commit -m "feat: add replay-safe hydration and event streaming"
```

## Task 4: Formalize Thread Narrative, Task Working State, and Worker Scratch Policy

**Files:**
- Create: `src/control/context/thread-narrative-service.ts`
- Create: `src/control/context/task-working-state.ts`
- Create: `src/control/context/worker-scratch-policy.ts`
- Modify: `src/runtime/graph/root/state.ts`
- Modify: `src/app/bootstrap.ts`
- Test: `tests/control/thread-narrative-service.test.ts`
- Test: `tests/control/worker-scratch-policy.test.ts`
- Test: `tests/control/context-compression.test.ts`

- [ ] **Step 1: Write failing tests for narrative promotion and scratch containment**

```ts
test("promotes only stable task outputs into thread narrative state", () => {
  // unstable scratch should be excluded
});

test("marks worker scratch as non-durable by default", () => {
  // default policy should reject persistence
});

test("compresses stale task context into narrative summaries before thread state grows unbounded", () => {
  // simulate long-running work and assert only curated summaries remain in durable thread/task state
});
```

- [ ] **Step 2: Run the context tests to verify failure**

Run:

```bash
bun test tests/control/thread-narrative-service.test.ts tests/control/worker-scratch-policy.test.ts tests/control/context-compression.test.ts
```

Expected: FAIL because the new services do not exist.

- [ ] **Step 3: Implement the context-layer services and wire them into bootstrap/root state**

Implement:

- a thread narrative service that accepts only curated stable outputs
- a task working-state helper for task-local summaries and blocking context
- a worker scratch policy that defaults to ephemeral, debug-only persistence
- summarization/compression rules that periodically condense stale task detail into narrative/task summaries without leaking worker scratch into durable state
- root graph/bootstrap wiring so workers write through these boundaries rather than directly into long-lived thread state

- [ ] **Step 4: Run context tests plus existing runtime recovery tests**

Run:

```bash
bun test tests/control/thread-narrative-service.test.ts tests/control/worker-scratch-policy.test.ts tests/control/context-compression.test.ts tests/runtime/interrupt-resume.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the context-discipline layer**

```bash
git add src/control/context src/runtime/graph/root/state.ts src/app/bootstrap.ts tests/control/thread-narrative-service.test.ts tests/control/worker-scratch-policy.test.ts tests/control/context-compression.test.ts
git commit -m "feat: formalize thread narrative and worker scratch boundaries"
```

## Task 5: Add a Durable Execution Ledger for Side-Effect Recovery

**Files:**
- Create: `src/persistence/ports/execution-ledger-port.ts`
- Create: `src/persistence/sqlite/sqlite-execution-ledger.ts`
- Modify: `src/persistence/sqlite/sqlite-migrator.ts`
- Modify: `src/control/tools/tool-types.ts`
- Modify: `src/control/tools/tool-registry.ts`
- Modify: `src/app/bootstrap.ts`
- Test: `tests/persistence/sqlite-execution-ledger.test.ts`
- Test: `tests/runtime/execution-ledger-recovery.test.ts`
- Test: `tests/runtime/runtime-restart-recovery.test.ts`

- [ ] **Step 1: Write failing tests for effect lifecycle persistence**

```ts
test("records planned, started, completed, and failed tool executions", async () => {
  // assert row transitions in sqlite ledger
});

test("marks a side effect as unknown_after_crash instead of replaying blindly", async () => {
  // simulate crash after start and expect human-required recovery state
});
```

- [ ] **Step 2: Run ledger tests to verify failure**

Run:

```bash
bun test tests/persistence/sqlite-execution-ledger.test.ts tests/runtime/execution-ledger-recovery.test.ts
```

Expected: FAIL because the ledger port/store and recovery behavior do not exist.

- [ ] **Step 3: Implement the minimal durable execution ledger**

Implement:

- SQLite table and port for execution ledger entries
- required statuses: `planned`, `started`, `completed`, `failed`, `unknown_after_crash`
- tool metadata that declares whether a tool invocation is effectful, safely retryable, or human-recovery-only after uncertainty
- tool registry hooks that write ledger state before and after effectful tool calls
- runtime recovery behavior that stops and surfaces human-required recovery when a crash leaves effect state uncertain
- daemon restart recovery that reloads uncertain ledger entries and existing checkpoint/resume state, then converts them back into blocked task recovery state on boot

- [ ] **Step 4: Run ledger tests plus tool-registry regressions**

Run:

```bash
bun test tests/persistence/sqlite-execution-ledger.test.ts tests/runtime/execution-ledger-recovery.test.ts tests/runtime/runtime-restart-recovery.test.ts tests/control/tool-registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit side-effect recovery semantics**

```bash
git add src/persistence/ports/execution-ledger-port.ts src/persistence/sqlite/sqlite-execution-ledger.ts src/persistence/sqlite/sqlite-migrator.ts src/control/tools/tool-types.ts src/control/tools/tool-registry.ts src/app/bootstrap.ts tests/persistence/sqlite-execution-ledger.test.ts tests/runtime/execution-ledger-recovery.test.ts tests/runtime/runtime-restart-recovery.test.ts
git commit -m "feat: add durable execution ledger for side effects"
```

## Task 6: Stabilize ModelGateway and Bring Verifier into Normal-Mode Model Use

**Files:**
- Modify: `src/infra/model-gateway.ts`
- Modify: `src/app/bootstrap.ts`
- Modify: `src/runtime/workers/verifier/graph.ts`
- Modify: `README.md`
- Test: `tests/infra/model-gateway-errors.test.ts`
- Test: `tests/app/verifier-model.test.ts`

- [ ] **Step 1: Write failing tests for timeout/error classification and verifier model wiring**

```ts
test("classifies timeout and provider errors into stable gateway errors", async () => {
  // stub provider and assert structured error shape
});

test("routes verifier summaries through the shared model gateway", async () => {
  // inject fake gateway and assert verifier uses it
});

test("classifies invalid or non-parseable model responses and applies bounded retries", async () => {
  // stub malformed provider responses and assert retry count plus terminal invalid_response error
});

test("distinguishes 4xx, 5xx, and rate-limit provider failures for retry policy", async () => {
  // assert 4xx is terminal, 5xx is retryable, and rate limits are surfaced distinctly
});
```

- [ ] **Step 2: Run the model tests to verify failure**

Run:

```bash
bun test tests/infra/model-gateway-errors.test.ts tests/app/verifier-model.test.ts
```

Expected: FAIL because the gateway error taxonomy and verifier integration are not present.

- [ ] **Step 3: Implement minimal gateway stabilization and verifier wiring**

Implement:

- explicit timeout handling
- bounded retry behavior for transient provider failures
- normalized config/network/provider/empty-response/invalid-response error taxonomy, including distinct handling for 4xx, 5xx, and rate-limit failures
- gateway hooks for verifier
- provider-state exposure that can be surfaced in the shell alongside the selected model
- README updates describing planner/verifier normal-mode model usage

- [ ] **Step 4: Run model tests plus smoke verification**

Run:

```bash
bun test tests/infra/model-gateway-errors.test.ts tests/app/verifier-model.test.ts tests/app/planner-model.test.ts
bun run smoke:planner
```

Expected: PASS, and the smoke script prints a real planner summary when local `OPENAI_*` variables are configured.

- [ ] **Step 5: Commit model stabilization**

```bash
git add src/infra/model-gateway.ts src/app/bootstrap.ts src/runtime/workers/verifier/graph.ts README.md tests/infra/model-gateway-errors.test.ts tests/app/verifier-model.test.ts
git commit -m "feat: stabilize model gateway and wire verifier"
```

## Task 7: Turn the TUI into a Clearer Work Shell and Add Agent-Team Confirmation

**Files:**
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/commands.ts`
- Modify: `src/interface/tui/components/task-panel.tsx`
- Modify: `src/interface/tui/components/approval-panel.tsx`
- Create: `src/interface/tui/components/status-bar.tsx`
- Create: `src/control/workers/team-policy.ts`
- Create: `src/control/workers/team-confirmation.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/runtime/service/runtime-snapshot.ts`
- Modify: `src/app/bootstrap.ts`
- Test: `tests/interface/tui-status-shell.test.tsx`
- Test: `tests/control/team-policy.test.ts`
- Test: `tests/interface/team-confirmation.test.tsx`

- [ ] **Step 1: Write failing tests for status-bar rendering and concise team confirmation**

```tsx
test("shows current thread, runtime state, model name, and blocked reason in the shell", () => {
  // render TUI with blocked thread + model state and assert visible strings
});

test("asks for concise agent-team confirmation without exposing internal topology", () => {
  // assert visible copy shows cost/reason/continue, but not planner+executor internals
});
```

- [ ] **Step 2: Run the shell and team-policy tests to verify failure**

Run:

```bash
bun test tests/interface/tui-status-shell.test.tsx tests/control/team-policy.test.ts tests/interface/team-confirmation.test.tsx
```

Expected: FAIL because status bar and team confirmation components do not exist.

- [ ] **Step 3: Implement the minimal work-shell UX and team policy**

Implement:

- a status bar showing active thread, current revision, runtime state, and model name
- provider health/config state in the shell so model failures are visible without reading raw logs
- current task status and pending approval count in the shell chrome so the user can see blocked work without scanning the event stream
- stronger blocked/interrupted guidance in the shell
- a team policy that recommends escalation based on task complexity/risk
- concise confirmation UX that exposes only “agent team” as a costlier mode
- runtime-owned team confirmation state and commands, so recommendation, awaiting-confirmation, approval, and rejection are persisted and enforced outside the TUI
- an explicit separation between event-stream rendering and answer/result rendering so the shell does not regress into a single mixed log pane

- [ ] **Step 4: Run the shell tests plus existing TUI regressions**

Run:

```bash
bun test tests/interface/tui-status-shell.test.tsx tests/control/team-policy.test.ts tests/interface/team-confirmation.test.tsx tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the Phase 1 shell and team-policy layer**

```bash
git add src/interface/tui/app.tsx src/interface/tui/screen.tsx src/interface/tui/commands.ts src/interface/tui/components/task-panel.tsx src/interface/tui/components/approval-panel.tsx src/interface/tui/components/status-bar.tsx src/control/workers/team-policy.ts src/control/workers/team-confirmation.ts src/runtime/service/runtime-command-handler.ts src/runtime/service/runtime-snapshot.ts src/app/bootstrap.ts tests/interface/tui-status-shell.test.tsx tests/control/team-policy.test.ts tests/interface/team-confirmation.test.tsx
git commit -m "feat: upgrade work shell and add agent team confirmation"
```

## Final Verification

- [ ] **Step 1: Run the full suite**

Run:

```bash
bun test
bun x tsc --noEmit
```

Expected:

- all tests pass
- typecheck exits with code 0

- [ ] **Step 2: Run the real planner smoke test**

Run:

```bash
bun run smoke:planner
```

Expected: a real planner summary is printed when local `OPENAI_*` variables are set.

- [ ] **Step 3: Run the CLI help path**

Run:

```bash
bun run src/app/main.ts --help
```

Expected: usage is printed and the shell does not mount.

- [ ] **Step 4: Verify runtime reconnect after a simulated CLI restart**

Run:

```bash
bun test tests/interface/runtime-client-reconnect.test.ts tests/runtime/hydrate-replay.test.ts tests/runtime/runtime-restart-recovery.test.ts
```

Expected: PASS, including reconnect from `last_event_seq + 1` against an already-running local runtime.

- [ ] **Step 5: Commit the verification pass if any documentation or fixture updates were needed**

```bash
git add README.md package.json docs/superpowers/plans/2026-04-02-cli-runtime-phase1.md
git commit -m "chore: finalize phase 1 runtime plan follow-through"
```
