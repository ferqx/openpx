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

## Smoke / Verification

Run these commands in order when checking the developer experience:

```bash
bun test
bun run typecheck
bun run src/app/main.ts --help
```

Expected results:

- `bun test` passes
- `bun run typecheck` passes
- `bun run src/app/main.ts --help` prints usage and exits without launching the TUI

## SQLite Data

By default, the app boots with in-memory SQLite for development.

To persist local state while using `bun run dev`, set `OPENWENPX_DATA_DIR` to a SQLite file path first:

```bash
OPENWENPX_DATA_DIR=./.openwenpx/agent.sqlite bun run dev
```

That path is used for both the app stores and LangGraph checkpointing.

## Approvals

Approvals are policy-gated. When a tool call is risky, the kernel creates a pending approval request instead of executing the change. The current TUI shows those pending requests in the approvals pane; it does not yet expose approve/reject actions in the shell.
