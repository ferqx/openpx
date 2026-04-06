# openpx

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
bun run smoke:planner
```

Expected results:

- `bun test` passes
- `bun run typecheck` passes
- `bun run src/app/main.ts --help` prints usage and exits without launching the TUI
- `bun run smoke:planner` prints a real planner summary when `OPENAI_*` variables are configured; expect a real model call that can take around 1-2 minutes in local use

## SQLite Data

By default, the app boots with in-memory SQLite for development.

To persist local state while using `bun run dev`, set `OPENPX_DATA_DIR` to a SQLite file path first:

```bash
OPENPX_DATA_DIR=./.openpx/agent.sqlite bun run dev
```

That path is used for both the app stores and LangGraph checkpointing.

## Planner Model Config

The planner worker reads local OpenAI-style variables from `.env`:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=kimi-k2.5
```

Copy [`.env.example`](/Users/chenchao/Code/ai/openwenpx-new/.env.example) to `.env` and fill in provider-specific values. `.env` is gitignored and stays local.

## Approvals

Approvals are policy-gated. When a tool call is risky, the kernel creates a pending approval request instead of executing the change. The TUI hydrates the latest blocked thread on boot and supports `/approve <approval-id>` and `/reject <approval-id>` to continue or cancel the blocked action.
