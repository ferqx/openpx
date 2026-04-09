# OpenPX Agent OS Reset Design

Date: 2026-04-06
Status: Active
Owner: openpx
Related milestone: M1-M2
Roadmap entrypoint: `ROADMAP.md`
Supersedes:
- `docs/superpowers/plans/2026-04-01-langgraph-bun-agent-os-v1.md` as the active implementation baseline
- `docs/superpowers/specs/2026-04-05-tui-optimization-design.md` as a driver for architecture work
- `docs/superpowers/specs/2026-04-05-tui-minimalist-refactor-design.md` as a driver for architecture work
- thread-compaction plan/spec iterations as primary architecture drivers

This document is the active reset baseline.

## 1. Why This Reset Exists

OpenPX is still on the original Agent OS trajectory, but the implementation has drifted in execution discipline.

The good news:

- the runtime/service split exists
- LangGraph is used as orchestration rather than as the whole app model
- SQLite-backed persistence, approvals, policy, and execution ledger all exist
- multi-project isolation and event-driven UI transport already exist

The problem:

- kernel responsibilities have blurred
- worker abstractions have not matured into first-class OS objects
- the TUI has started deriving business truth locally
- several recent specs optimize shell behavior before the system contract is stable

The result is a system that still contains the right ideas, but no longer presents a single clean center of gravity.

This reset does not propose a rewrite. It proposes a controlled contraction back to a clear Agent OS core, followed by deliberate regrowth.

## 2. Product Direction

OpenPX V1 remains:

- a local, TUI-first Agent OS
- built on Bun, TypeScript, LangGraph, Ink, and SQLite
- centered on long-running code work

But from this point onward, the highest priority is not shell polish. It is system clarity.

The new product direction is:

1. Re-establish runtime truth boundaries
2. Re-establish explicit worker and task lifecycles
3. Stabilize protocol contracts between runtime and TUI
4. Shrink the TUI back into a shell rather than a second state engine
5. Preserve only those optimizations that fit inside the above rules

## 3. Non-Goals

This reset is explicitly not trying to do the following:

- rewrite the persistence layer
- remove LangGraph
- replace the local HTTP/SSE runtime model
- redesign the visual shell from scratch
- build a distributed daemon or remote cloud control plane
- finalize advanced narrative/compaction strategy before the core contract is stable

## 4. Mandatory System Invariants

These invariants replace all softer interpretations from recent documents.

1. `runtime` is the only execution truth
2. `snapshot + events + stores` define the durable system truth exposed to clients
3. `TUI` may cache presentation state, but must not derive competing business truth
4. Every active unit of work must be attributable to `thread_id`, `task_id`, and when applicable `worker_id`
5. Every side effect must flow through policy, approval when needed, and execution ledger recording
6. Every resumable execution boundary must be explicit in protocol and storage semantics
7. LangGraph state is an execution substrate, not the full application model
8. Auxiliary systems such as narrative and compaction may refine views, but may not redefine the core lifecycle model
9. Project code must not use `any`, `as any`, or equivalent type escapes in core layers

## 5. Layer Ownership Model

### 5.1 Runtime Layer

The runtime owns:

- scope isolation by workspace/project
- command intake
- session boot/hydration
- worker execution coordination
- graph invocation
- snapshot generation
- event publication
- persistence integration

The runtime must not leak unstable internal data structures directly to the shell.

### 5.2 Kernel Layer

The kernel is the control-plane coordinator.

It owns:

- command arbitration
- thread selection or creation
- task creation and transition orchestration
- worker scheduling handoff
- approval transition handling
- projection into stable views
- emission of stable runtime events

It must not accumulate unrelated view-specific logic that belongs either in protocol projection or UI rendering.

### 5.3 Worker Layer

Workers are first-class runtime entities, not just graph role labels.

Each worker must carry:

- `workerId`
- `threadId`
- `taskId`
- `role`
- `status`
- `spawnReason`
- `startedAt`
- `endedAt`
- a resumability marker or equivalent checkpoint boundary

The control plane must support, at minimum:

- `spawn`
- `resume`
- `cancel`
- `join`
- `inspect`

LangGraph subgraphs may remain the internal implementation for a worker runtime, but they are not the external abstraction.

### 5.4 Tool/Policy Layer

This layer keeps its current direction and remains one of the healthier parts of the system.

It owns:

- tool lookup
- risk classification
- allow/deny/approval decisions
- approval request creation
- execution ledger recording
- tool execution dispatch

No UI concern should influence these semantics.

### 5.5 Context/Projection Layer

This layer owns:

- thread narrative projection
- working set projection
- recovery facts
- compaction support
- memory consolidation support

This layer is explicitly auxiliary. It supports thread views and recovery ergonomics, but it does not define the base lifecycle contract for threads, tasks, approvals, or workers.

### 5.6 Interface Layer

The TUI is a client shell.

It may:

- submit runtime commands
- subscribe to runtime events
- render runtime snapshots
- hold purely presentational state

It may not:

- invent independent task truth
- invent independent approval truth
- invent independent answer truth
- rebuild authoritative thread history from arbitrary local heuristics

## 6. Stable Protocol Model

The runtime must converge on a stable protocol that the shell can rely on without reverse-engineering internal state.

All protocol objects in this reset must be fully typed without `any` escape hatches.

The protocol is explicitly versioned.

- every snapshot and runtime event envelope carries `protocolVersion`
- clients may request a protocol version explicitly
- the runtime must reject unsupported protocol versions rather than silently guessing
- shell-specific compatibility behavior must sit above the protocol layer, not inside it

### 6.1 Stable Commands

The command model must be explicit and non-chat-shaped for control actions.

Expected command categories:

- thread navigation commands
- task submission commands
- approval resolution commands
- worker control commands

Human text input is only for user intent, not for internal control semantics such as approval resume.

### 6.2 Stable Snapshot

The runtime snapshot must be sufficient for full shell hydration.

Minimum stable snapshot objects:

- `ThreadView`
- `TaskView`
- `ApprovalView`
- `AnswerView`
- `WorkerView`
- top-level runtime metadata

The snapshot must not depend on client-side reconstruction of hidden lifecycle state.

### 6.3 Stable Events

Events must describe changes to stable objects or stable runtime phases.

Expected categories:

- thread lifecycle events
- task lifecycle events
- worker lifecycle events
- approval lifecycle events
- answer stream/update events
- runtime/model status events

Events are not just cosmetic hints. They are incremental changes on top of the same model exposed by snapshots.

### 6.4 Event Layering Rules

OpenPX now uses three distinct event layers. They must not be conflated.

#### Durable Events

Durable events are persisted thread facts used for recovery, narrative projection, and compatibility replay.

They:

- are written to durable storage
- must survive process restart
- must remain narrow and intentional
- may support thread/task/tool recovery facts and durable thread-view projection

They must not:

- carry ephemeral token-by-token stream output
- carry TUI-only hydration/session refresh notifications
- act as a generic dump for every internal transition

Examples allowed as durable events today:

- `task.created`
- `task.started`
- `task.updated`
- `task.completed`
- `task.failed`
- `thread.blocked`
- `thread.view_updated`
- `tool.executed`
- `tool.failed`

Examples explicitly forbidden from durable storage:

- `stream.thinking_started`
- `stream.thinking_chunk`
- `stream.text_chunk`
- `stream.tool_call_started`
- `stream.tool_call_completed`
- `stream.done`
- `session.updated`

#### Kernel Events

Kernel events are in-process coordination events on the control-plane event bus.

They:

- connect kernel services, background execution, stream adapters, and projection logic
- may carry richer internal payloads than the stable external protocol
- may include events that are never persisted and never sent directly to clients

They must not:

- be treated as stable external API contracts
- be assumed replayable after restart unless separately projected into durable state
- be exposed to the TUI without protocol translation

Examples of kernel-only or kernel-origin events:

- `thread.started`
- `thread.interrupted`
- `thread.view_updated` as an in-process projection event
- `task.failed`
- `model.status`
- model gateway performance/status events
- stream adapter events before runtime protocol publication

#### Runtime Events

Runtime events are the stable external protocol published to clients over SSE or equivalent transports.

They:

- must match the runtime protocol schema
- must be safe for external consumers to depend on
- describe stable object changes or stable runtime phases
- layer on top of snapshot truth rather than replacing it

They must not:

- expose arbitrary kernel payloads just because they were convenient internally
- carry TUI-only refresh semantics
- imply durable persistence unless also represented as durable events or durable view state

Examples of runtime events:

- `thread.started`
- `thread.interrupted`
- `thread.blocked`
- `thread.view_updated`
- `task.created`
- `task.updated`
- `task.started`
- `task.completed`
- `task.failed`
- `tool.executed`
- `tool.failed`
- `model.status`
- `stream.*`

#### Mapping Rules

The allowed relationships between the layers are:

- a durable event may also be projected into a runtime event if that transition is externally relevant
- a kernel event may be projected into a runtime event only through the stable runtime protocol
- a kernel event may be persisted as a durable event only if it belongs to the curated durable whitelist
- a runtime event does not automatically imply durable persistence

The forbidden assumptions are:

- not every kernel event is durable
- not every kernel event is a runtime event
- not every runtime event is durable
- TUI hydration is not a runtime SSE event

Concrete examples:

- `stream.text_chunk` is runtime-only and must stay out of durable storage
- `task.created` may exist in all three layers, but with layer-appropriate payload discipline
- `thread.view_updated` may exist as both a durable compatibility event and a runtime projection event, but TUI hydration must use `session.updated`, not overload `thread.view_updated`

## 7. New Thread and Task Model

### 7.1 Thread Model

Threads remain the user-facing continuity container.

Required properties:

- identity and scope
- stable lifecycle state
- stable rendered view state
- active task linkage
- blocking state when applicable

Threads should be resumable without requiring the shell to understand internal recovery tricks.

### 7.2 Task Model

Tasks are the primary work units.

Each task should expose:

- `taskId`
- `threadId`
- `summary`
- `status`
- `ownerWorkerId` when active
- `blockingReason` when blocked
- timestamps

Task truth belongs in stores and runtime views, not in local TUI arrays derived from convenience heuristics.

### 7.3 Worker Model

Workers become explicit in both snapshot and event streams.

This is required for OpenPX to deserve the "Agent OS" label in a strong sense rather than in a marketing sense.

## 8. TUI Simplification Contract

The TUI should become thinner after this reset, not thicker.

### 8.1 What the TUI keeps

- composer input state
- viewport/layout preferences
- panel expansion state
- transient formatting helpers

### 8.2 What the TUI stops doing

- synthesizing canonical assistant history from arbitrary event combinations
- deciding task completion semantics on its own
- deciding approval semantics on its own
- treating runtime hydration as an implementation detail to patch over mismatched contracts

### 8.3 Rendering Principle

The TUI should render from stable objects first and event deltas second.

If a screen cannot be reconstructed from `snapshot + event replay`, the protocol is incomplete.

## 9. Approval and Resume Semantics

Current approval flow still leaks chat-shaped resume semantics. That must stop.

The reset requires:

- explicit approval resolution commands
- explicit resumed execution boundaries
- no hidden dependence on `"yes"` or `"no"` text to continue system execution

This is required both for correctness and for future automation.

## 10. Compaction and Narrative Repositioning

Compaction and narrative systems are not being removed, but their architectural priority is reduced.

They should be treated as:

- projection optimizers
- recovery aids
- context management helpers

They should not:

- determine the primary runtime protocol
- force TUI architecture choices
- substitute for missing lifecycle modeling

## 11. What Is Now Officially Deprecated

The following are deprecated as architecture-driving practices:

- shell-first architecture changes that force kernel semantics afterward
- introducing new API fields with `z.any()` as long-lived placeholders
- using `any` or `as any` to bypass unresolved architecture boundaries
- treating graph state as implicit application truth
- using natural-language approval responses as internal control commands
- expanding local UI state until it acts like a second control plane
- allowing specialized optimization specs to outrank the runtime contract

## 12. Migration Strategy

The migration is a medium refactor, not a rewrite.

The sequence is:

1. Freeze architecture drift
2. Define stable protocol
3. Refactor kernel around that protocol
4. Make workers first-class
5. Simplify the TUI into a protocol consumer
6. Reposition compaction/narrative logic as support systems
7. Remove superseded compatibility logic and documents

This order is mandatory. Doing TUI cleanup before protocol stabilization will recreate the same drift in a different shape.

## 13. Acceptance Criteria For The Reset

The reset is successful only when all of the following are true:

- the runtime exposes a stable typed snapshot/view model without `z.any()` escape hatches for core objects
- the reset removes `any` and `as any` usage from touched core files
- the TUI no longer owns independent business truth for messages, tasks, or approvals
- approval and resume semantics are explicit protocol actions
- worker lifecycle is visible and managed as a first-class runtime concern
- `SessionKernel` no longer mixes unrelated responsibilities into one control path
- compaction/narrative systems can be disabled without collapsing the base thread/task/worker contract
- all new implementation plans reference this document as the top-level architecture authority

## 13.1 Current Reset Status

Current status under this active reset baseline:

- kernel coordination has been split enough that projection, command arbitration, and background control actions are no longer one monolith
- worker lifecycle has entered the stable runtime protocol and snapshot/view surface
- the TUI no longer keeps canonical local task, approval, answer, or worker truth
- remaining reset work is audit and hardening work, not new shell feature work

The next mainline after this reset is hardening and recovery verification, not shell polish.

## 13.2 TUI Truth Mapping

The TUI must follow this fixed truth mapping:

| TUI section | Protocol source |
| --- | --- |
| thread list | `threads` |
| conversation stream | `messages`, then `answers`, then `summary`, then `narrativeSummary` |
| approval block | `approvals` plus `blockingReason` |
| worker block | `workers` |
| history pane | `messages`, `answers`, `narrativeSummary` |
| status bar | `session.status`, `model.status`, `activeTaskIntent`, workspace metadata |
| composer mode | `session.status` |

Allowed local TUI state is limited to:

- input and keyboard interaction state
- utility pane visibility and selection state
- transient display overlays such as pending user text, streamed assistant text, thinking metrics, and scroll offsets
- local shell affordances such as exit confirmation and settings interactions

If a screen cannot be rebuilt from snapshot plus ordered event replay, the protocol or session derivation is incomplete.

## 13.3 Hardening Handoff

The reset mainline is now considered structurally complete enough to enter M3 hardening.

The next priority is to prove recovery behavior rather than continue architecture churn.

M3 hardening focuses on:

- daemon reuse and scoped runtime isolation
- reconnect semantics driven by `snapshot + ordered event replay`
- restart recovery for blocked, waiting approval, and completed threads
- interrupt, resume, approval, and reject paths producing the same durable thread truth after hydration
- worker lifecycle consistency between immediate runtime state, hydration, and replay

The hardening rule is:

- if recovery behavior is ambiguous, fix the runtime or protocol boundary
- do not patch recovery gaps by storing more TUI-local business truth

Exit from this phase requires an explicit recovery matrix in tests, not just informal manual confidence.

## 14. Document Policy Going Forward

From this point onward:

- this document is the top-level design authority for the reset
- implementation plans must reference this spec
- specialized specs must declare themselves subordinate to this spec
- older documents may remain for historical context, but not as active drivers unless explicitly reinstated
