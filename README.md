# openwenpx-new

## Install

```bash
bun install
```

## Run TUI

```bash
bun run dev
```

You can also start it directly:

```bash
bun run src/app/main.ts
```

## Run Tests

```bash
bun test
```

```bash
bun run typecheck
```

## SQLite Data

By default, the app boots with in-memory SQLite for development. If you pass a file path as `dataDir`, both the app stores and LangGraph checkpointing use that SQLite file. A common local choice is a workspace-relative path such as `./.openwenpx/agent.sqlite`.

## Approvals

Approvals are policy-gated. When a tool call is risky, the kernel creates a pending approval request instead of executing the change. The TUI renders those requests so you can approve or reject them from the control plane flow.
