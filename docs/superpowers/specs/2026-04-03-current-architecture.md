# OpenWENPX Current System Architecture (V1)

**Date:** 2026-04-03
**Status:** Historical Baseline Under Reset

## Reset Notice

This document remains useful as a historical baseline, but it is no longer the top-level architecture authority.

Active reset documents:

- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

Use the reset design and plan for current implementation decisions.

Reset implementation status as of 2026-04-06:

- stable runtime protocol modules are in place
- kernel responsibilities are split across command handling, background execution, and view projection
- workers are first-class persisted runtime entities
- TUI state is reduced to shell/presentation concerns and stable session consumption
- narrative and compaction are auxiliary systems rather than lifecycle authorities

## 1. Top-Level Topology

OpenWENPX operates as a local "Agent OS" split into two distinct tiers:

1.  **Shared Runtime (The "Server")**: A long-lived Bun process per project that owns the orchestration kernel, persistence, and model access.
2.  **CLI Shell (The "Client")**: A React/Ink-based TUI that connects to the runtime via local HTTP and SSE.

### Component Diagram
```
[ User ] <--> [ CLI Shell ] <--> [ Local HTTP/SSE API ] <--> [ Shared Runtime ]
                                                                    |
                                              ----------------------+----------------------
                                              |                     |                     |
                                      [ Session Kernel ]    [ Model Gateway ]    [ Persistence ]
                                              |                     |               (SQLite)
                                      [ Root Graph ]        (Failover & Retries)
                                              |
                                    [ Agent Team Workers ]
```

## 2. Shared Runtime & Multi-Project Isolation

- **Daemon Discovery**: Uses lockfiles in `.openwenpx/runtime/{projectId}.daemon.json` to detect and attach to existing runtimes.
- **Project Scoping**: Runtimes are isolated by `projectId` and `workspaceRoot`. Each project maintains independent thread histories, memory, and checkpoints.
- **Protocol**: 
    - `GET /v1/snapshot`: Returns full state for client hydration.
    - `POST /v1/commands`: Routes user actions (submit input, approve, reject).
    - `GET /v1/events`: SSE stream for real-time state updates.

### Event Layering Note

As of the reset implementation, the system uses three separate event layers:

- **Durable events**: persisted recovery and narrative support events in the thread event log
- **Kernel events**: in-process coordination events on the control-plane event bus
- **Runtime events**: stable external protocol events emitted to clients

Important consequences:

- `stream.*` belongs to the runtime event layer, not the durable event log
- `thread.view_updated` may be emitted externally and persisted for compatibility, but it is not the TUI hydration channel
- TUI hydration uses session-state transfer, not overloaded runtime SSE semantics

## 3. Orchestration & Graph Logic

The system uses **LangGraph.js** for deterministic yet flexible agentic flows.

- **Root Graph**: Manages high-level modes (`plan`, `execute`, `verify`, `waiting_approval`).
- **Interrupt/Resume**: Native support for pausing execution for human approval or team-mode recommendations.
- **Verifier Feedback Loop**: Failed verifications automatically route back to executors with actionable feedback.

## 4. Context & Stability Model

- **Three-Layer Context**:
    1.  **Thread Narrative**: The "long-term memory" of the thread. Curated stable outcomes.
    2.  **Task Working State**: Task-local context, including current plans and file lists.
    3.  **Worker Scratch**: Ephemeral reasoning and tool output, discarded by default to prevent noise.
- **Memory Consolidation**: Periodically summarizes thread narrative into "Project Memory" for cross-thread retrieval.
- **Durable Execution Ledger**: Records every side-effecting tool call (`planned`, `started`, `completed`). Prevents duplicate execution after crashes.

## 5. Model Access (ModelGateway)

- **Unified Interface**: All LLM calls (Planner, Verifier) go through a single gateway.
- **Reliability**: Implements per-call timeouts, error classification, and automatic failover to secondary providers.
- **Observability**: Emits `thinking` and `responding` status events for UI feedback.

## 6. High-Fidelity UI (The "Premium" Shell)

- **Conversation Stream**: A vertical, unified flow of user inputs, agent actions, and final answers.
- **Interactive Feedback**: Real-time spinners, timers, and ANSI-colored task status indicators.
- **Safety**: Dedicated regions for high-risk recommendations and approval prompts.

## 7. Persistence Layer

- **SQLite Client**: Shared connection pool with WAL mode enabled.
- **Store Components**:
    - `ThreadStore`: Scoped thread records and revisions.
    - `TaskStore`: Hierarchical task state.
    - `EventLog`: Sequential domain events for replay.
    - `MemoryStore`: Namespace-scoped factual records.
    - `ExecutionLedger`: Side-effect idempotency tracking.
    - `SqliteCheckpointer`: LangGraph state persistence.
