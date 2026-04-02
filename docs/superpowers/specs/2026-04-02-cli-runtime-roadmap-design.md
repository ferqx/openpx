# OpenWENPX CLI Runtime Roadmap Design

Date: 2026-04-02
Status: Draft for review

## 1. System Goal

OpenWENPX should be defined as:

`CLI-first agent OS for long-running code work`

Two goals must hold at the same time:

- V1 product surface: a terminal-first code-agent experience in the family of `gemini-cli`, `codex-cli`, and `claude code`
- system reality: a headless shared runtime whose first client happens to be a CLI/TUI shell

The value of the system is not “better chat quality” or “faster token streaming”. The value is:

- more stable long-running task completion loops
- lower rework cost
- safer interruption and recovery
- better orchestration discipline for code-agent workloads

V1 is not trying to fully replicate Claude Code surface behavior. It should borrow the strongest agent-OS ideas from that leaked codebase while preserving OpenWENPX’s own runtime model and future design direction.

## 2. Dual-Track Architecture

OpenWENPX should evolve along two tracks:

- Track A: CLI product surface
- Track B: shared runtime kernel

Track A is the user-facing shell:

- command input
- event rendering
- answer presentation
- thread/task visibility
- approval interaction

Track B is the system itself:

- thread/task/worker lifecycle
- orchestration
- policy and approvals
- persistence and event log
- memory and preferences
- checkpoint/resume
- model gateway

CLI is the best entry point. Runtime is the only source of truth.

Runtime also owns orchestration authority. Any “main code agent” referenced later in this document must be understood as a runtime-owned coordinator role inside the active thread, not as a separate source of truth outside the runtime.

## 3. Runtime Core Model

The core hierarchy should be:

- `DeviceRuntime`
- `Profile`
- `Workspace`
- `Project`
- `Thread`
- `Task`
- `Worker`

Responsibilities:

- `DeviceRuntime`: single local runtime service per device
- `Profile`: user preferences, model config, user-level memory, future multi-profile expansion point
- `Workspace`: local filesystem and tool boundary
- `Project`: repository-level context and durable project memory
- `Thread`: long-running narrative container
- `Task`: work unit inside a thread
- `Worker`: execution unit owned by a task

Key rule:

`Thread` is long-lived truth, `Task` is local work, `Worker` is execution.

## 4. Lifecycle and State Machines

### Thread

Recommended states:

- `active`
- `blocked`
- `waiting_approval`
- `interrupted`
- `completed`
- `failed`

`completed` does not mean the thread is dead. It means the current stage ended and the thread remains reusable.

`blocked` is used when the current task cannot proceed because of a non-approval dependency, such as missing config, an unavailable external prerequisite, or a policy gate that requires additional setup but not an approval prompt.

`waiting_approval` is reserved specifically for approval-gated continuation.

### Task

Recommended states:

- `queued`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`

`blocked` is a normal first-class state.

Thread roll-up rule:

- if the active task is blocked on approval, the thread becomes `waiting_approval`
- if the active task is blocked for a recoverable non-approval reason, the thread becomes `blocked`
- if execution is intentionally paused or suspended at a resumable boundary, the thread becomes `interrupted`

### Worker

Recommended states:

- `created`
- `starting`
- `running`
- `paused`
- `completed`
- `failed`
- `cancelled`

Workers are not long-lived truth containers.

## 5. Three-Layer Context Model

Long-running stability depends on strict context discipline.

### Thread Narrative State

Contains only high-value long-term truth:

- main goal
- mainline summary
- confirmed decisions
- phase results
- durable approval outcomes
- high-value artifact references

Must not absorb:

- raw tool chatter
- long scratch reasoning
- unverified intermediate conclusions

### Task Working State

Contains recoverable task-local context:

- task goal
- local plan
- related files/modules
- current verification status
- task-level approval or blocking data
- task-local artifacts

### Worker Private Scratch State

Default behavior:

- short-lived
- not durable by default
- not directly merged into thread state

Worker scratch exists to isolate noise. It may be persisted only for explicit debug or failure inspection.

### Information Flow Rules

- `worker -> task`: only structured findings, evidence, results, and actionable exceptions
- `task -> thread`: only stable summaries, decisions, and phase outcomes
- `thread -> worker`: only minimal curated context, never the full raw history

## 6. Long-Running Stability Loop

V1 long-running stability should be built from five mechanisms:

- context compression
- checkpointing
- interrupt/resume
- failure recovery
- state hydration

### Context Compression

Default kernel behavior. Goal: preserve semantic stability, not just reduce token usage.

### Checkpointing

Persist enough execution and control state to continue instead of restarting from scratch.

### Interrupt / Resume

Treat pause and continuation as normal execution paths, not exception logic.

### Failure Recovery

Differentiate:

- recoverable failures
- human-required recovery
- fatal failures

Task failure must not automatically kill the thread.

For side-effecting executor work, checkpoint/resume must be paired with a durable execution ledger.

Required rule:

- every effectful tool action gets a durable execution record before the side effect starts
- the record tracks at least `planned`, `started`, `completed`, `failed`, and `unknown_after_crash`
- replay is allowed only for operations that are explicitly idempotent or proven incomplete
- if runtime cannot prove whether the side effect committed, the task must enter a human-required recovery state instead of blindly replaying

This execution ledger is the idempotency boundary for safe recovery.

### State Hydration

All clients must follow:

1. hydrate current thread/task/approval snapshot
2. subscribe to live events

This must be versioned. Hydration cannot be an unversioned point-in-time read.

Required consistency contract:

- snapshot responses include a monotonic `last_event_seq` or thread revision
- event streams support replay from `last_event_seq + 1`
- clients attach the stream with that replay cursor
- runtime retains a replay window that bridges normal reconnects

This avoids dropping transitions that happen between snapshot read and stream attachment.

## 7. Agent Team Strategy

`agent team` is an internal runtime strategy layer, not a user-facing topology.

### External User Model

Users should only perceive:

- normal execution
- agent team execution

Users do not need to understand internal planner/executor/verifier topology.

### Internal Runtime Model

Runtime may choose internal topologies such as:

- single-agent
- planner + executor
- planner + executor + verifier
- planner + executor/verifier + read-only parallel helpers

But these are internal only.

Important authority rule:

- runtime is the only orchestration authority
- the “main code agent” is the runtime-owned coordinating agent for the active thread
- planner provides orchestration intelligence and recommendations, but does not own system authority
- subagents execute delegated work and report back to the main code agent through runtime-managed state and events

### Cost Control

Agent team consumes more tokens and usually more wall-clock time. Therefore:

- runtime recommends team mode
- user must explicitly confirm before team execution starts

Confirmation should remain concise:

- why team mode is recommended
- that cost will increase
- whether to continue

Verifier policy clarification:

- a lightweight verifier pass may still run inside normal mode as part of the main code agent’s default completion loop
- explicit agent-team confirmation is required only when runtime promotes the task into additional subagent-backed team execution outside that normal-mode envelope
- therefore verifier integration may precede full team-confirmation UX as long as it remains inside the default single-agent cost budget

## 8. Shared Runtime Service and Multi-Frontend Sync

V1 should be:

- CLI-first on the surface
- shared local runtime first in architecture

### Service Shape

Use:

- local `HTTP` for control APIs
- local `SSE` for event streams

### Launch Behavior

Use:

- on-demand startup
- seamless background persistence once started

### Multi-Frontend Rule

Threads belong to the runtime, not to any single UI.

Implications:

- CLI, VSCode, Web, Desktop, and Mobile should all connect to the same runtime in the future
- history, approvals, preferences, tasks, and answers stay consistent
- state mutations are runtime-owned and atomic

Multi-client mutation rule:

- observations may be concurrent
- state-changing commands must be revision-checked or otherwise serialized by runtime
- commands should target a known thread revision or session epoch
- if the target revision is stale, runtime rejects or revalidates the command instead of silently applying conflicting changes

V1 may optionally designate a foreground controller for an actively edited thread, but runtime revision checks are the minimum required safety boundary.

V1 scope assumption:

- same-device shared runtime only
- CLI, VSCode, Web, Desktop, and Mobile references in V1 mean clients on the same user device connecting to the same local runtime
- remote multi-device clients are out of scope for V1 and should be treated as a later protocol/authentication expansion

## 9. Long-Lived Thread Model

`Thread` must be treated as a long-running work container, not a disposable chat record.

Rules:

- a project may have multiple long-lived threads
- default entry returns the most recently active thread
- users can still list, switch, and create threads explicitly
- the system should not rely on frequent thread creation to avoid context drift

Blocked and interrupted threads must remain the primary continuation target. New inputs should not silently replace them with new threads.

## 10. CLI/TUI Product Surface

The V1 shell should feel like:

`a stateful code-work shell`

It should not degrade into:

- a plain chat stream
- a tool log dump
- a generic engineering dashboard

The interface should center around:

- current thread
- current task/task status
- pending approvals
- model/runtime status
- event stream
- answer/result pane

Event stream and answer pane must remain distinct:

- event stream explains what is happening
- answer pane explains what the system has produced for the user

## 11. Model Integration Strategy

Models should control reasoning layers, not own runtime truth.

### V1 Sequence

Recommended order:

1. `planner`
2. `verifier`
3. other judgment-oriented roles
4. never let `executor` become an unconstrained free side-effect agent

### ModelGateway

All model access must flow through a shared `ModelGateway`.

Responsibilities:

- provider configuration
- API key and base URL handling
- timeout/retry behavior
- error classification
- provider compatibility normalization
- future telemetry and routing

### Error Classes

At minimum classify:

- missing config
- network failure
- timeout
- provider 4xx/5xx/rate limits
- empty or invalid model response

## 12. Role Definitions

### Planner

Responsibilities:

- understand user intent
- decompose work
- assess complexity and risk
- determine whether agent team mode should be recommended
- define next execution direction

Planner is orchestration intelligence, not the side-effect layer.

### Executor

Responsibilities:

- perform bounded execution under runtime control
- use approved tools
- read/write/run commands inside policy boundaries
- return structured execution outcomes

Executor is the controlled action layer, not the system owner.

### Verifier

Responsibilities:

- independently inspect outputs
- identify regressions, gaps, and missed conditions
- reduce rework risk
- return pass/fail guidance and follow-up findings

Verifier is the quality isolation layer.

Key principle:

These are not three prompt personas. They are three system responsibilities.

## 13. V1 Agent Team Communication Constraint

V1 must use a hub-and-spoke team topology.

Rules:

- main agent = code agent
- all other agents = subagents
- subagents are assigned work by the main code agent
- subagents do not directly communicate with each other
- subagents do not orchestrate other subagents
- all meaningful results flow back through the main code agent

Subagents may perform different kinds of work, including bounded tool usage and scoped code modification when explicitly delegated. But only the main code agent orchestrates, and that coordinating code agent itself is runtime-owned rather than an independent authority.

Core principle:

`Subagents may act, but only the main code agent may orchestrate.`

## 14. Roadmap

### Phase 0: Current Base

Already emerging:

- thread/task/worker split
- policy and approvals
- checkpoint/resume
- basic TUI shell
- planner model entrypoint
- blocked approval recovery

### Phase 1: Runtime Stabilization

Goals:

- shared runtime skeleton
- durable long-lived thread semantics
- three-layer context model
- full long-running recovery loop
- stable model gateway
- shell quality upgrade

### Phase 2: Mature CLI Product

Goals:

- long-running code work shell quality
- stronger thread/task/approval UX
- verifier integration
- clearer runtime and model observability
- operationally usable team recommendation flow

### Phase 3: Shared Runtime for Multiple Clients

Goals:

- stable control API
- stable event stream
- client hydration model
- runtime-first ownership of all state

### Phase 4: Multi-Frontend Productization

Targets:

- VSCode extension
- Web client
- Desktop shell
- future mobile companion

### V2 Directions

- stronger team policy
- richer background jobs
- memory maintenance and consolidation
- multi-provider routing
- broader non-code agent expansion

## 15. Immediate Implementation Roadmap

### Batch 1: Shared Runtime Skeleton

- extract runtime service entrypoint
- define local control API and event stream boundaries
- make CLI/TUI a runtime client
- define snapshot versioning and replay cursor semantics for hydrate-to-stream continuity

### Batch 2: Long-Lived Thread Semantics

- project-to-thread mapping
- recent-thread default selection
- thread list/new/switch/continue
- explicit blocked/interrupted continuation behavior

### Batch 3: Context Discipline

- formalize thread narrative state
- formalize task working state
- make worker scratch ephemeral by default
- add narrative and task summarization policies

### Batch 4: Long-Running Recovery Loop

- complete checkpoint/hydration/resume integration
- improve runtime restart recovery
- add reconnect and blocked recovery regressions
- add durable execution-ledger semantics for side-effect recovery

### Batch 5: ModelGateway Stabilization

- timeout/retry/error taxonomy
- planner/verifier through shared gateway
- provider state visibility
- keep lightweight verifier-in-normal-mode semantics explicit until team policy is fully rolled out

### Batch 6: CLI/TUI as Work Shell

- thread/task status bar
- model/runtime state hints
- stronger blocked and interrupted UX
- clearer answer aggregation

### Batch 7: Agent Team Policy

- recommendation engine
- concise user confirmation for team mode
- internal topology hidden from default UX
- explicit boundary between normal-mode verifier use and confirmed team-mode subagent expansion

Recommended order:

1. Batch 1
2. Batch 2
3. Batch 3
4. Batch 4
5. Batch 5
6. Batch 6
7. Batch 7

## Final Position

V1 is not “a terminal that looks like Claude Code”.

V1 is:

`a shared, long-running, code-agent runtime with a CLI-first work shell`

The CLI matters, but runtime correctness, long-lived thread stability, controlled execution, and recoverability matter more.
