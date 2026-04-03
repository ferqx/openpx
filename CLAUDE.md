# OpenWENPX Project Guide

CLI-first agent OS for long-running code work. Built with Bun, React (Ink), and LangGraph.

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

## Architecture Principles
1. **Runtime-First**: The shared runtime is the single source of truth.
2. **Durable Recovery**: Every effectful tool call is logged in a durable ledger.
3. **Context Discipline**: Three-layer model (Narrative, Working, Scratch) prevents context drift.
4. **Multi-Project**: Threads and runtimes are isolated per workspace/projectId.
5. **Human-in-the-Loop**: High-risk actions and team recommendations require explicit confirmation.

## Development Workflow
- Always use `bun test` before committing.
- Follow TDD for new domain or runtime features.
- Update `api-schema.ts` when changing protocol types.
- Maintain `CLAUDE.md` and roadmap specs as the project evolves.
