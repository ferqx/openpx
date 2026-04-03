# LangGraph + Bun Agent OS Design

Date: 2026-04-01
Status: Draft for user review

## Goal

Design a Claude Code inspired agent core using TypeScript, Bun, and LangGraph, with a TUI shell as the primary interface.

The intent is not to clone Claude Code's surface UX. The intent is to absorb the strongest design ideas from Claude Code's agent core: clear runtime boundaries, durable execution, explicit control-plane objects, tool governance, approval gates, background-capable services, and an OS-shaped architecture rather than a single chat loop.

## Product Direction

V1 should prioritize a correct agent OS kernel over a highly polished UI.

The target shape is:

- TUI shell as the primary user interface
- Local daemon-style runtime, but still shipped as a single local Bun project in V1
- LangGraph used as the orchestration runtime, not as the entire system model
- Explicit control plane for tasks, workers, policy, memory, approvals, and tools
- SQLite as the concrete storage backend in V1 behind replaceable storage ports

## Guiding Principles

1. The system should be OS-shaped, not prompt-shaped.
2. LangGraph should own orchestration and checkpointed execution, not global application state.
3. UI should consume events and submit commands, not mutate runtime state directly.
4. All side effects must flow through policy and approval.
5. Durable memory must be curated, namespaced, and attributable.
6. The architecture should preserve future migration paths to a true daemon, remote control plane, and non-SQLite backends.
7. Claude Code should be treated as inspiration for system design quality, not as a template to copy mechanically.

## V1 Architecture Choice

The recommended architecture is Graph-Centric OS:

- Interface layer: TUI shell
- Kernel layer: session kernel, thread lifecycle, command bus, event bus, interrupt/resume coordination
- Control plane: task manager, worker manager, policy engine, approval service, memory service, tool registry
- Runtime layer: LangGraph root runtime and role-specific worker runtimes
- Persistence layer: storage ports with SQLite adapters

This balances correctness and extensibility without overcommitting to a full multi-process distributed daemon in V1.

## Core Invariants

The following invariants are mandatory:

1. Every unit of work must have `thread_id` and `task_id`.
2. Every side effect must pass through policy evaluation and approval when required.
3. Every long-running task must be pausable, resumable, and replayable.
4. Every spawned subagent must have an explicit role and lifecycle.
5. Memory must be split between thread state and durable memory namespaces.
6. UI must be event-driven and must not directly alter internal runtime state.

## Core Domain Objects

The stable system model should include:

- `Thread`: the main container for a continuing user session
- `Task`: a traceable, cancelable, resumable work unit
- `Worker`: the runtime entity executing a task
- `ToolCall`: the auditable record for a tool invocation
- `ApprovalRequest`: a persistent object representing blocked risky work
- `Event`: the canonical fact stream consumed by the TUI
- `MemoryRecord`: a durable memory entry stored in a namespace

Important rule: LangGraph state is an execution projection, not the source of truth for the whole system.

## Layer Responsibilities

### Interface Layer

The TUI shell should provide:

- composer for natural language input and shell-like commands
- event stream
- task panel
- approval panel
- answer pane

The answer pane should show both narrative and structured output, including:

- summary of the turn
- changed files
- added and removed lines
- generated artifacts
- verification outcomes
- next actions

### Kernel Layer

The session kernel is responsible for:

- opening and resuming threads
- receiving user commands
- dispatching commands into the control plane
- coordinating interrupt/resume boundaries
- publishing events to the interface layer

### Control Plane

The control plane is responsible for:

- task creation, transition, and blocking
- worker spawning and lifecycle management
- policy decisions
- approval request creation and resolution
- durable memory read/write policy
- tool lookup and execution routing

### Runtime Layer

LangGraph should be used for:

- root orchestration flow
- planner, executor, verifier, and memory-maintainer worker logic
- checkpoint-backed interrupt/resume
- stateful step execution within a task

Runtime code must not bypass policy, tool registry, or persistence ports.

### Persistence Layer

Persistence should be abstracted behind ports:

- `StoragePort`
- `CheckpointPort`
- `TaskStorePort`
- `MemoryStorePort`
- `EventLogPort`

V1 should implement SQLite adapters only. Postgres should be a future adapter target, not a V1 requirement.

## Directory Structure

Recommended project layout:

```text
open-agent/
  src/
    app/
    interface/tui/
    kernel/
    control/
      tasks/
      workers/
      policy/
      memory/
      tools/
    runtime/
      graph/root/
      workers/planner/
      workers/executor/
      workers/verifier/
      workers/memory-maintainer/
    persistence/
      ports/
      sqlite/
      migrations/
    domain/
    shared/
```

Key restrictions:

- interface code must not directly import SQLite adapters
- graph nodes must not directly mutate the filesystem or spawn processes
- tool execution must go through the policy-aware tool registry
- LangGraph state must not become the persistence schema for the whole system

## State Machines

### Thread State

Recommended thread states:

- `idle`
- `active`
- `waiting_approval`
- `interrupted`
- `completed`
- `failed`

`completed` means the current turn is done, not that the thread is permanently closed.

### Task State

Recommended task states:

- `queued`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`

`blocked` covers waiting for approval, waiting on a child task, or waiting on resume.

### Worker State

Recommended worker states:

- `created`
- `starting`
- `running`
- `stopping`
- `exited`
- `failed`

Workers must carry:

- `worker_id`
- `role`
- `owner_task_id`
- `thread_id`
- `spawn_reason`
- timestamps

## Worker Model

V1 should define subagents as explicit workers, not just as graph branches.

Recommended worker roles:

- `planner`
- `executor`
- `verifier`
- `memory_maintainer`

The control plane should expose worker operations like:

- `spawn`
- `stream`
- `cancel`
- `join`
- `resume`

Internally, worker runtimes may use LangGraph graphs or subgraphs, but the outer abstraction should remain a worker runtime contract.

## Tooling, Policy, and Approval

All side effects must use a policy-aware tool pipeline:

`worker -> tool registry -> policy engine -> allow | deny | needs_approval -> execute or block`

### V1 Tool Risk Classes

Recommended top-level classes:

- `read`
- `apply_patch`
- `sensitive_write`
- `exec`

### Apply Patch Policy

`apply_patch` is the primary code-editing capability in V1. It should support:

- modifying files
- creating files
- deleting files

Constraints:

- paths must remain inside the workspace
- patch actions should be classified as `modify_file`, `create_file`, or `delete_file`
- deletion is higher risk than ordinary modification

Recommended policy:

- auto-allow ordinary source file modifications in the workspace
- require approval for file deletion
- require approval for sensitive files such as package manifests, lockfiles, CI config, migration files, environment config, script entrypoints, and permission-related configuration
- require approval for unusually large patches
- deny out-of-workspace writes

### Exec Policy

`exec` should be classified at least as:

- `read_like`
- `write_like`
- `network_like`
- `destructive`

### Approval Model

Approval should be modeled as a first-class persistent object, not as a transient UI prompt.

The TUI should render approval requests, but the truth should live in the control plane and persistence layer.

## Memory Design

V1 should use three memory namespaces:

- `thread/*`
- `project/<project_id>/*`
- `user/<user_id>/*`

### Durable Memory Policy

Durable memory should be sparse and curated.

Recommended durable memory categories:

- project decisions
- project conventions
- user preferences
- verified facts

The system should avoid auto-persisting:

- raw conversation fragments
- unverified assumptions
- temporary drafts
- unstable context

### Durable Memory Write Timing

Recommended write timing:

- explicit user command, for example “remember this”
- post-turn guard after a completed turn

### Retrieval Rules

Retrieval should be conservative:

- small number of records per namespace
- mode-aware retrieval for plan, execute, and verify phases
- source-labeled injection into runtime context
- durable memory should support, not replace, thread state

## TUI Model

The TUI should be task-centric, not chat-centric.

Primary regions:

- composer
- event stream
- task panel
- approval panel
- answer pane

Input types:

- natural language input
- shell commands such as `/tasks`, `/resume`, `/approve`, `/reject`, `/memory`, `/thread new`

Event stream purpose:

- show what the system is doing

Answer pane purpose:

- show the turn result in a user-facing summary form

These responsibilities must remain separate.

## Error Handling

Recommended error classes:

- `recoverable`
- `interruptible`
- `fatal`

Recoverable errors should preserve thread/task context and allow retries or continuation.

Interruptible states should block execution without being treated as failures.

Fatal errors should mark the affected entity as failed and emit sufficient diagnostic events.

## Testing Strategy

Testing should be layered:

- domain and control-plane tests for state machines, policy decisions, memory routing, and worker lifecycle
- runtime integration tests for kernel to control-plane to LangGraph to tools to event log
- TUI interaction tests for approval flows, event rendering, and answer pane aggregation

V1 should prioritize control-plane correctness tests over UI polish tests.

## V1 Completion Criteria

V1 is complete when all of the following are true:

1. A user can create and continue a thread in the TUI.
2. Every unit of work has `thread_id` and `task_id`.
3. The system can spawn planner, executor, and verifier workers.
4. All side-effect tools flow through policy and approval.
5. `apply_patch` is implemented with path and risk controls.
6. Threads can be interrupted and resumed through checkpoint-backed execution.
7. Three memory namespaces are persisted and retrievable.
8. The answer pane reports summary, changed files, line deltas, and verification results.

## Out of Scope For V1

The following should remain out of scope for the first version:

- full remote control plane
- multi-machine worker execution
- production Postgres deployment
- highly polished Claude Code parity UI
- broad autonomous long-term memory writing

## Recommendation

Build V1 as a local, TUI-first, agent-kernel system with:

- Bun + TypeScript
- LangGraph as orchestration runtime
- explicit control-plane services
- SQLite behind storage ports
- curated three-tier memory
- policy-gated tool execution
- an answer pane that summarizes both narrative outcomes and concrete code changes

This preserves the best architectural ideas from Claude Code while keeping the first implementation tractable.
