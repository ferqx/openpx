# openpx Project Guide

CLI-first agent OS for long-running code work. Built with Bun, React (Ink), and LangGraph.

## Planning Baseline
- `ROADMAP.md` is the active roadmap entrypoint.
- `docs/active/2026-04-06-agent-os-reset-design.md` and `docs/active/2026-04-06-agent-os-reset-plan.md` are the active architecture and implementation baselines.
- Treat `docs/historical/2026-04-02-cli-runtime-roadmap-design.md` as historical context, not the current source of priority.
- Superpowers-related skills must also follow `docs/README.md` and `docs/superpowers/README.md` when creating or updating documentation.

## Core Commands
- **Run TUI**: `bun dev` (Starts the shared runtime and attaches the high-fidelity shell)
- **Run Tests**: `bun test` (Full suite including domain, persistence, and runtime tests)
- **Type Check**: `bun run typecheck` or `bunx tsc --noEmit`
- **Smoke Test**: `bun run smoke:planner` (Verifies planner model connectivity)

## Project Structure
- `src/app/`: Bootstrap logic and main entrypoints.
- `src/kernel/`: The SessionKernel, Command Bus, and Thread services.
- `src/runtime/`: LangGraph implementation (Root Graph and Specialized Workers).
- `src/interface/`: TUI components (Ink-based) and Runtime Client.
- `src/control/`: Policy engine, Task management, and Tool registry.
- `src/domain/`: Core entities (Thread, Task, Event, Memory).
- `src/persistence/`: SQLite implementations for all ports.
- `src/shared/`: Config, ID generators, and Zod schemas.

## Tech Stack & Standards
- **Runtime**: Bun 1.x
- **Language**: TypeScript (Strict mode)
- **Orchestration**: LangGraph.js
- **UI**: React 19 + Ink 6 (High-fidelity ANSI output)
- **Database**: SQLite (via `bun:sqlite`)
- **Model Access**: LangChain OpenAI / ModelGateway
- **API**: local HTTP (Control) + SSE (Events)

## TypeScript Rules
- Do not use `any` in project code.
- Do not introduce `as any` casts to bypass the type system.
- When touching an existing file, remove nearby `any` usage within the scope of the change.
- Prefer `unknown`, explicit unions, generics, `z.infer<>`, or small local interfaces over loose placeholder types.
- Protocol, kernel, runtime, and TUI state layers must not rely on `any`.

## Architecture Principles
1. **Runtime-First**: The shared runtime is the single source of truth.
2. **Durable Recovery**: Every effectful tool call is logged in a durable ledger.
3. **Context Discipline**: Three-layer model (Narrative, Working, Scratch) prevents context drift.
4. **Multi-Project**: Threads and runtimes are isolated per workspace/projectId.
5. **Human-in-the-Loop**: High-risk actions and team recommendations require explicit confirmation.

## Core Runtime Model
- **Agent**: The user-facing system that accepts goals, decides next actions, uses tools, and keeps work moving until it completes, blocks, or needs approval.
- **Thread**: The long-lived collaboration container for one line of work. It holds message history, durable context, recovery facts, and project association. A thread preserves continuity across many execution attempts.
- **Run**: One execution instance inside a thread. A run begins from a user request or a resume action and tracks the lifecycle of that specific attempt, such as `running`, `waiting_approval`, `blocked`, or `completed`.
- **Task**: A concrete unit of work within a run, such as inspecting code, editing files, or verifying a fix. Tasks are short-lived and should describe the current step being executed rather than the whole conversation history.
- **Tool**: The only way an agent may observe or affect the project environment. File reads, terminal commands, patch application, and future external integrations all belong here.
- **Approval**: A control-plane checkpoint for actions that must not execute autonomously. Risky or state-changing tool calls must flow through policy and approval before execution.
- **Runtime**: The execution substrate that owns state transitions, persistence, event publication, recovery, and protocol views. The TUI renders runtime truth; it does not invent competing business state.

## Thread, Run, and Task Boundaries
- **Thread answers**: "What ongoing line of work are we in?" It stores durable conversation context, not per-step execution details.
- **Run answers**: "What is happening in this execution attempt right now?" It stores the lifecycle of one attempt, not the entire long-term history.
- **Task answers**: "What concrete step is the agent doing right now?" It stores step-level inputs, outputs, and result summaries, not the full thread narrative.
- A thread may outlive many runs. A run may contain many tasks over time. In V1, prefer a single active run per thread and a single active task per run unless parallelism is explicitly designed.
- Do not use `thread` as a substitute for task state, and do not use `task` as a dumping ground for long-term context.

## Worker Positioning
- `worker` is currently an internal runtime concept, not a primary product concept.
- Workers may exist as execution units used by the runtime to advance tasks, but the stable external model is `thread -> run -> task -> tool -> approval`.
- `planner`, `executor`, `verifier`, `graph`, and `node` are implementation mechanisms. They must not become the main architecture vocabulary for user-facing or protocol-facing behavior.

## Development Workflow
- Always use `bun test` before committing.
- Follow TDD for new domain or runtime features.
- Update `api-schema.ts` when changing protocol types.
- Treat the no-`any` rule as a hard project constraint, not a cleanup wishlist.
- Maintain `AGENTS.md` and roadmap specs as the project evolves.
