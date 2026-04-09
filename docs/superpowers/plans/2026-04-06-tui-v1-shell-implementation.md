# TUI v1 Shell Implementation Plan

Date: 2026-04-06
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This shell-first plan is preserved for historical reference, but it is not the active implementation baseline after the reset.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-facing openpx TUI shell with a welcome-first launch flow, chat-first single-thread UX, slash commands, current-thread history, approval handling, and `Esc`-driven thread interruption.

**Architecture:** Keep the existing `remote-kernel -> RuntimeSessionState -> Ink` contract intact, but add a thin TUI launch/view-state layer so the UI no longer auto-renders the last hydrated thread on startup. Route slash commands through local TUI parsing first, only forwarding true runtime mutations to the kernel, and add a dedicated interrupt path for `Esc` instead of overloading input commands.

**Tech Stack:** Bun, TypeScript, React 19, Ink 6, Zod, LangGraph.js runtime service, SQLite-backed session stores

---

## Scope Rules

- Do not add multi-thread parallel operation in this plan.
- Do not redesign runtime snapshot/event schemas beyond the minimum needed for interrupt support.
- Do not reintroduce `/approve`, `/reject`, or `/resume` as first-class slash commands.
- Do not use `any` or `as any`; touched files must stay compliant with project policy.
- Keep the TUI visually quiet: no dashboard explosion, no default thread list panel, no heavy framing.

## Planned File Map

### Slash Command Contract

- Modify: `src/interface/tui/commands.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `tests/interface/commands.test.ts`
- Modify: `tests/interface/tui-app.test.tsx`

### Launch State And Welcome Shell

- Create: `src/interface/tui/view-state.ts`
- Create: `src/interface/tui/components/welcome-pane.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/runtime-session.test.ts`

### Current-Thread Utility Views

- Create: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/remote-kernel.test.ts`

### Composer Approval And Blocked Semantics

- Modify: `src/interface/tui/components/composer.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `tests/interface/confirmation-flow.test.tsx`
- Modify: `tests/interface/tui-app.test.tsx`

### Escape Interrupt Pipeline

- Modify: `src/interface/tui/hooks/use-kernel.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/runtime/service/protocol/runtime-command-schema.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/kernel/interrupt-service.ts`
- Modify: `tests/interface/remote-kernel.test.ts`
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/kernel/session-kernel.test.ts`
- Modify: `tests/runtime/api-compliance.test.ts`
- Modify: `tests/runtime/runtime-http-server.test.ts`

## Task 1: Replace Legacy Thread Slash Commands With A TUI-First Command Surface

**Files:**
- Modify: `src/interface/tui/commands.ts`
- Modify: `src/interface/tui/app.tsx`
- Test: `tests/interface/commands.test.ts`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- `/new`, `/plan foo`, `/history`, `/sessions`, `/clear`, `/settings`, and `/help` parse successfully
- legacy `/thread ...`, `/approve ...`, and `/reject ...` command forms are no longer accepted as preferred TUI commands
- `/plan foo` preserves the plan payload separately from ordinary free-text input

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/tui-app.test.tsx
```

Expected: FAIL because the parser still only understands `/thread ...` and approval commands.

- [ ] **Step 3: Implement the new command contract**

Refactor `commands.ts` so parsing returns a TUI-first union, for example:

```ts
type ParsedTuiInput =
  | { kind: "submit"; text: string; intent?: "plan" }
  | { kind: "command"; name: "new" | "history" | "sessions" | "clear" | "settings" | "help" };
```

Update `App` to branch on this parsed result locally before forwarding runtime mutations.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/commands.ts src/interface/tui/app.tsx tests/interface/commands.test.ts tests/interface/tui-app.test.tsx
git commit -m "feat: add tui v1 slash command surface"
```

## Task 2: Add Welcome-First Launch State And New-Thread-On-First-Input Semantics

**Files:**
- Create: `src/interface/tui/view-state.ts`
- Create: `src/interface/tui/components/welcome-pane.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/runtime-session.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- a fresh TUI launch renders a welcome shell instead of immediately showing hydrated historical thread content
- the first submitted free-text input issues a new-thread mutation before submitting the first task
- the first `/plan ...` input also creates a new thread before sending the planner-oriented prompt
- once a thread has been created during this launch, the main stream switches from welcome mode to session mode

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/runtime-session.test.ts
```

Expected: FAIL because hydration still drives the initial main view and first input reuses the latest thread.

- [ ] **Step 3: Implement launch-aware view state**

Create a thin state helper, for example:

```ts
type TuiLaunchState = {
  hasCreatedThreadThisLaunch: boolean;
  activeUtilityPane: "none" | "history" | "sessions" | "settings" | "help";
};
```

Render a dedicated `WelcomePane` when `hasCreatedThreadThisLaunch` is false. On first submit:

1. send `thread_new`
2. mark launch state as initialized
3. send the actual task submission

Do not delete session hydration; keep it available for utility views and post-launch rendering.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/runtime-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/view-state.ts src/interface/tui/components/welcome-pane.tsx src/interface/tui/app.tsx src/interface/tui/screen.tsx src/interface/tui/components/interaction-stream.tsx src/interface/runtime/runtime-session.ts tests/interface/tui-app.test.tsx tests/interface/runtime-session.test.ts
git commit -m "feat: add welcome-first tui launch flow"
```

## Task 3: Implement Current-Thread Utility Panes For History, Sessions, Settings, And Help

**Files:**
- Create: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/remote-kernel.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- `/history` shows a readable summary of the current thread, using answers first and falling back to narrative summary
- `/sessions` shows the existing thread list summary without making it the default main view
- `/settings` and `/help` show static utility content locally without network/runtime mutations
- `/clear` closes any utility pane and clears the transient in-memory message stream without deleting hydrated session facts

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/remote-kernel.test.ts
```

Expected: FAIL because these commands do not yet have local utility views.

- [ ] **Step 3: Implement utility-pane rendering**

Create a focused component that renders utility content from session data, for example:

```ts
type UtilityPaneMode = "history" | "sessions" | "settings" | "help";
```

Rules:

- `history`: current-thread answers, then narrative summary fallback
- `sessions`: formatted list from `RuntimeSessionState.threads`
- `settings`: minimal local read-only settings summary
- `help`: slash commands plus keybindings

Keep the pane dismissible and secondary to the main stream.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx tests/interface/remote-kernel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/components/utility-pane.tsx src/interface/tui/app.tsx src/interface/tui/screen.tsx src/interface/runtime/runtime-session.ts tests/interface/tui-app.test.tsx tests/interface/remote-kernel.test.ts
git commit -m "feat: add tui utility panes for history and help"
```

## Task 4: Tighten Composer Semantics For Approval And Blocked States

**Files:**
- Modify: `src/interface/tui/components/composer.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/components/interaction-stream.tsx`
- Test: `tests/interface/confirmation-flow.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- pending approvals accept `y`, `n`, `yes`, `no`, `可以`, and `不行`
- approval confirmation stays in the current conversational shell instead of requiring slash commands
- blocked threads disable normal input but do not masquerade as approvals
- the approval prompt text clearly distinguishes dangerous-operation and option-selection approvals from blocked recovery shells

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/confirmation-flow.test.tsx tests/interface/tui-app.test.tsx
```

Expected: FAIL because confirmation handling is still limited to the old narrow input rules.

- [ ] **Step 3: Implement the composer state machine**

Normalize approval input with a tiny helper, for example:

```ts
function parseApprovalDecision(text: string): "approve" | "reject" | undefined {
  const normalized = text.trim().toLowerCase();
  if (["y", "yes", "ok", "可以"].includes(normalized)) return "approve";
  if (["n", "no", "不行"].includes(normalized)) return "reject";
}
```

Keep blocked state separate: blocked shells render guidance and disable task submission, but they do not enter approval-confirm mode.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/confirmation-flow.test.tsx tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/components/composer.tsx src/interface/tui/app.tsx src/interface/tui/components/interaction-stream.tsx tests/interface/confirmation-flow.test.tsx tests/interface/tui-app.test.tsx
git commit -m "feat: tighten tui approval and blocked composer flow"
```

## Task 5: Add A Dedicated Escape Interrupt Pipeline

**Files:**
- Modify: `src/interface/tui/hooks/use-kernel.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/runtime/service/protocol/runtime-command-schema.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/kernel/session-kernel.ts`
- Modify: `src/kernel/interrupt-service.ts`
- Test: `tests/interface/remote-kernel.test.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/kernel/session-kernel.test.ts`
- Test: `tests/runtime/api-compliance.test.ts`
- Test: `tests/runtime/runtime-http-server.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- pressing `Esc` in the TUI calls a dedicated interrupt path instead of exiting or submitting input
- the TUI kernel exposes an explicit interrupt method, for example `interruptCurrentThread()`
- runtime command schema accepts an interrupt command such as `{ kind: "interrupt", threadId?: string }`
- runtime HTTP routing and kernel handling propagate that command without breaking existing `add_task` behavior

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/remote-kernel.test.ts tests/interface/tui-app.test.tsx tests/kernel/session-kernel.test.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-http-server.test.ts
```

Expected: FAIL because there is no explicit interrupt command path yet.

- [ ] **Step 3: Implement the interrupt command chain**

Wire a dedicated interrupt path end to end:

```ts
type TuiKernel = {
  handleCommand: (...args) => Promise<TuiSessionResult>;
  hydrateSession?: () => Promise<TuiSessionResult | undefined>;
  interruptCurrentThread?: () => Promise<TuiSessionResult | undefined>;
};
```

And on the runtime side:

```ts
z.object({ kind: z.literal("interrupt"), threadId: z.string().min(1).optional() })
```

The runtime handler should resolve the active thread when `threadId` is omitted, publish the interrupt through the kernel interrupt service, persist the thread as interrupted if required by the existing model, then return a hydrated session result.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/remote-kernel.test.ts tests/interface/tui-app.test.tsx tests/kernel/session-kernel.test.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/hooks/use-kernel.ts src/interface/runtime/remote-kernel.ts src/interface/tui/app.tsx src/runtime/service/protocol/runtime-command-schema.ts src/runtime/service/runtime-command-handler.ts src/kernel/session-kernel.ts src/kernel/interrupt-service.ts tests/interface/remote-kernel.test.ts tests/interface/tui-app.test.tsx tests/kernel/session-kernel.test.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-http-server.test.ts
git commit -m "feat: add tui escape interrupt pipeline"
```

## Task 6: Run End-To-End TUI Verification And Final Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-tui-v1-shell-design.md`
- Modify: `docs/superpowers/plans/2026-04-06-tui-v1-shell-implementation.md`

- [ ] **Step 1: Run the focused interface and runtime suite**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/confirmation-flow.test.tsx tests/interface/remote-kernel.test.ts tests/interface/runtime-session.test.ts tests/interface/tui-app.test.tsx tests/kernel/session-kernel.test.ts tests/runtime/api-compliance.test.ts tests/runtime/runtime-http-server.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the broader safety checks**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full project test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Update docs if implementation differs from the approved spec**

Adjust the spec or this plan only if implementation required a justified, reviewed deviation.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-tui-v1-shell-design.md docs/superpowers/plans/2026-04-06-tui-v1-shell-implementation.md
git commit -m "docs: finalize tui v1 shell implementation plan"
```
