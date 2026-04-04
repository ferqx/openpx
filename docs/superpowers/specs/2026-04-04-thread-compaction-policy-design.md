# OpenWENPX Thread-Level Compaction Policy Design

Date: 2026-04-04
Status: Proposed

## 1. Goal

Define a clear thread-level compaction policy for the runtime before adding more TUI polish.

The policy must optimize for:

- correctness of resume and recovery first
- token and context budget control second
- explicit separation between recovery state and display state

V1 does not attempt full audit-grade replay of every historical decision. It only guarantees that the current thread can be restored and continued correctly.

## 2. Problem

The current system already has:

- a LangGraph root graph with planner, executor, verifier, and post-turn guard
- durable thread, task, approval, event, and checkpoint persistence
- a narrative service that compresses completed task summaries into a thread summary
- a TUI that renders thread summaries, approvals, blocked state, and answers

But the compaction contract is still underspecified.

Today, multiple concerns are still too close together:

- recovery-critical thread state
- narrative summaries for users and models
- transient event and tool output used only for the current working window

If these layers remain mixed, the system will eventually depend on fragile summaries or long event history for resume and blocked-thread recovery.

## 3. Design Principles

- runtime truth comes before TUI presentation
- event streams are inputs, not the durable truth model
- recovery state must remain structured and lossless
- narrative summaries may be rewritten, folded, and compacted
- the model should receive only the current working set plus curated durable context
- compaction is a thread policy, not just a single summarize node

## 4. Root Architecture

V1 should keep the current LangGraph-centered runtime shape and make the compaction contract explicit inside it.

Recommended graph shape:

```text
RootGraph
  intake
  retrieve_memory
  route
  planner_subgraph
  executor_subgraph
  verifier_subgraph
  post_turn_guard
  compact
  finish
```

Responsibilities:

- `intake`: normalize user input and current thread context
- `retrieve_memory`: fetch cross-thread durable memory
- `route`: choose planner, executor, verifier, or finish
- `planner_subgraph`: plan and break down work
- `executor_subgraph`: perform tools and side effects
- `verifier_subgraph`: verify outputs independently
- `post_turn_guard`: enforce approval, verify, compact, or finish decisions
- `compact`: invoke the compaction policy service
- `finish`: emit the stable user-facing result

Important rule:

`compact` must not own all compaction semantics by itself. It should call a dedicated policy/service layer. The graph controls flow. The policy controls state boundaries.

## 5. Three State Layers

The thread must be represented in three separate layers.

### 5.1 RecoveryFacts

`RecoveryFacts` are the minimum structured facts required to restore and continue the thread safely.

They must not be represented only as free text.

V1 must preserve at least:

- thread identity and lifecycle
  - `threadId`
  - `workspaceRoot`
  - `projectId`
  - `status`
  - `revision`
- active or blocked task facts
  - current `taskId`
  - task `status`
  - task `summary`
  - `blockingReason.kind`
  - `blockingReason.message`
- approval facts
  - `approvalRequestId`
  - `taskId`
  - `toolCallId`
  - `summary`
  - `risk`
  - `status`
  - required tool linkage
- latest durable answer
  - stable answer identifier or anchor
  - stable answer summary
- resume anchors
  - event sequence or equivalent durable continuation anchor
  - narrative revision or equivalent version marker

The system must be able to hydrate a blocked or waiting-approval thread correctly using `RecoveryFacts` even if old narrative text or old event detail has already been compacted away.

### 5.2 NarrativeState

`NarrativeState` is the compacted explanation layer for users, the model, and future thread continuation.

It is descriptive, not authoritative for recovery.

V1 should include:

- `threadSummary`
- `taskSummaries[]`
- `openLoops[]`
- `notableEvents[]`

This layer may be rewritten during compaction as long as it remains faithful to the stable outcomes.

### 5.3 WorkingSetWindow

`WorkingSetWindow` is the short-lived context that the runtime actively feeds back into the root graph and model for the next steps.

It should contain only the still-useful current window, for example:

- latest user request
- current task summary
- recent verifier feedback
- recent tool results still needed for decision-making
- currently relevant memory retrieval results

It is intentionally incomplete and should shrink aggressively over time.

## 6. Compaction Rules

The policy must classify thread data into three buckets.

### 6.1 Must Preserve

These must remain structured and durable:

- thread lifecycle facts
- blocking facts
- pending approvals
- latest durable answer
- required resume anchors

These facts must never be reduced to a loose paragraph such as “the thread is blocked on a risky action.”

### 6.2 Can Summarize

These may be compressed into narrative summaries:

- completed task process history
- old incremental answer updates
- old planner and verifier prose
- already-consumed tool output
- old messages that no longer belong in the working window

### 6.3 Can Drop

These can be removed after their meaning has been absorbed elsewhere:

- duplicated display events
- long raw stdout or stderr blobs
- transient reasoning scratch
- TUI-only presentation state
- derived fields that can be recalculated from durable facts

## 7. Trigger Model

Compaction should not be one monolithic action. V1 should support three trigger levels.

### 7.1 Soft Compact

Trigger:

- working messages exceed a small threshold
- tool outputs accumulate beyond a small threshold
- recent context becomes wider than the current next-step need

Action:

- shrink the working set
- fold large tool output into task-local summary
- keep the most recent actionable window intact

### 7.2 Boundary Compact

Trigger:

- task reaches `completed`
- task reaches `failed`
- thread enters `waiting_approval`
- thread enters `blocked`
- thread enters `interrupted`

Action:

- freeze the current recovery facts
- generate or update a stable phase summary
- record open loops
- trim stale working context

This is the most important trigger because it marks resumable boundaries.

### 7.3 Hard Compact

Trigger:

- token pressure becomes high
- thread history becomes too large for healthy hydration
- long-lived threads exceed an operational threshold

Action:

- reduce older working history aggressively
- preserve only the recent working set, recovery facts, and compacted narrative

## 8. Data Flow

The system should treat raw objects as input streams, not as final thread truth.

```text
task / approval / answer / thread event
  -> classify
  -> promote stable facts
  -> compact old working context
  -> persist derived thread view
  -> hydrate next RootState
```

### 8.1 Input Streams

The runtime produces:

- task lifecycle changes
- approval lifecycle changes
- answer updates
- thread lifecycle events
- tool outputs and verifier outputs

### 8.2 Classification

Each input must be classified as one or more of:

- `RecoveryFact`
- `NarrativeCandidate`
- `WorkingSetOnly`
- `DropSafe`

Examples:

- a blocked task with `blockingReason` is a `RecoveryFact`
- a pending approval is a `RecoveryFact`
- a completed task with a stable summary is a `RecoveryFact` and `NarrativeCandidate`
- a final answer summary is a `RecoveryFact` and `NarrativeCandidate`
- a large grep output is `WorkingSetOnly`
- a transient TUI notification is `DropSafe`

### 8.3 Promotion

After classification, data is promoted into the three state layers.

Examples:

- `Task running` updates `WorkingSetWindow`
- `Task blocked` updates `RecoveryFacts` and may add a narrative note
- `Task completed` updates `RecoveryFacts.lastStableTask` and appends a task summary
- `Approval pending` updates `RecoveryFacts.pendingApprovals`
- `Approval approved/rejected` removes the pending approval and adds a narrative note
- `answer.updated` writes to `WorkingSetWindow` while unstable and to `RecoveryFacts.latestDurableAnswer` once stabilized

### 8.4 Persistence

The persistent thread view should be a derived view, not a direct replay requirement over the full raw event stream.

V1 durable thread view should include:

- thread facts
- recovery facts
- narrative state
- narrative revision
- resume anchors

### 8.5 Hydration

When a thread resumes, the root graph should be rehydrated from:

- recovery facts
- compact narrative summary
- recent working set
- retrieved long-term memory

It should not load the full historical event log back into the model by default.

## 9. Interface Boundaries

The policy should be implemented through explicit services rather than scattered logic inside graph nodes.

### 9.1 ThreadCompactionClassifier

Responsibility:

- classify incoming task, approval, answer, and event records by durability and compaction role

### 9.2 ThreadStateProjector

Responsibility:

- project classified input into:
  - `RecoveryFacts`
  - `NarrativeState`
  - `WorkingSetWindow`

This is the place where the current narrative service should evolve, but with broader responsibility than simple task-summary concatenation.

### 9.3 ThreadCompactionPolicy

Responsibility:

- decide when to soft, boundary, or hard compact
- rewrite narrative state
- shrink the working set
- preserve recovery facts unchanged in meaning

### 9.4 RootStateHydrator

Responsibility:

- build the next `RootState` from the compacted durable thread view
- determine exactly what context is fed back to the model

### 9.5 Root Graph

Responsibility:

- orchestrate execution order
- invoke planner, executor, verifier, and guard nodes
- call the compaction policy at the right time

The graph must not own the detailed compaction rules.

## 10. Repository Mapping

This design maps onto the current repository as follows:

- `src/runtime/graph/root/graph.ts`
  - remains the orchestration graph
  - gains explicit `retrieve_memory`, `compact`, and `finish` structure over time
- `src/control/context/thread-narrative-service.ts`
  - should evolve toward part of the thread projection layer
  - should stop being the sole holder of thread compaction semantics
- `src/runtime/service/runtime-scoped-session.ts`
  - should prefer reading a derived durable thread view instead of reconstructing state from mixed sources
- `src/runtime/service/runtime-snapshot.ts`
  - should remain a mapping layer from durable runtime state to client snapshot
- `src/app/bootstrap.ts`
  - should wire classifier, projector, compaction policy, and hydrator explicitly

## 11. Non-Goals

V1 does not require:

- full audit-grade replay of every historical decision
- infinite retention of raw event streams in model-facing context
- TUI-driven thread truth
- arbitrary summarization of recovery-critical state

## 12. Acceptance Criteria

The design is successful when:

- a blocked thread can be rehydrated correctly without depending on old narrative prose
- a waiting-approval thread can resume correctly using structured approval facts
- old raw tool output can be removed without breaking next-step execution
- thread summaries remain concise without becoming the sole recovery source
- the runtime can feed a compact working window back into the model instead of replaying the full thread history

## 13. Recommended Next Step

Write an implementation plan that:

- introduces explicit `RecoveryFacts`, `NarrativeState`, and `WorkingSetWindow` types
- adds classifier, projector, compaction policy, and hydrator boundaries
- updates root-graph flow to call compaction deliberately
- migrates snapshot and hydration logic to consume the derived thread view
