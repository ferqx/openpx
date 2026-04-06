# TUI `/plan` And Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the openpx TUI so `/plan` is a real planning-task entry with visible stage state, `/` input shows command suggestions, and `settings` becomes an interactive JSON-backed configuration editor with global defaults plus project overrides.

**Architecture:** Keep the current chat-first TUI shell and remote-kernel boundary, but promote planning into an explicit command intent rather than a string convention. Add a dedicated slash-suggestion state inside the composer, a lightweight stage/status surface in the TUI session model, and a local config service that resolves effective values from `Project > Global` while defaulting edits to the global file.

**Tech Stack:** Bun, TypeScript, React 19, Ink 6, Zod, LangGraph.js runtime service, local JSON config files

---

## Scope Rules

- Do not reintroduce a long-lived frontend-only `/plan mode`.
- Do not make `settings` a generic schema editor; keep the first version focused on a curated settings list.
- Do not replace the current welcome shell, utility-pane, or approval flow unless required by the new features.
- Do not use `any` or `as any`; touched files must remain strict.
- Keep the command suggestion UI attached to the composer, not as a full-screen palette.

## Planned File Map

### Planning Intent And Stage State

- Modify: `src/interface/tui/commands.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/components/status-bar.tsx`
- Modify: `src/runtime/service/protocol/runtime-command-schema.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Test: `tests/interface/commands.test.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/remote-kernel.test.ts`
- Test: `tests/runtime/api-compliance.test.ts`

### Slash Command Suggestion UI

- Create: `src/interface/tui/components/command-suggestions.tsx`
- Modify: `src/interface/tui/components/composer.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/view-state.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/commands.test.ts`

### Local Config Model

- Create: `src/interface/tui/settings/config-types.ts`
- Create: `src/interface/tui/settings/config-store.ts`
- Create: `src/interface/tui/settings/config-resolver.ts`
- Test: `tests/interface/settings-config.test.ts`

### Interactive Settings Screen

- Create: `src/interface/tui/components/settings-pane.tsx`
- Modify: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/view-state.ts`
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/interface/commands.test.ts`

### Status And Usage Integration

- Modify: `src/interface/tui/components/status-bar.tsx`
- Modify: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `tests/interface/tui-app.test.tsx`

## Task 1: Promote `/plan` To A Real Planning Intent

**Files:**
- Modify: `src/interface/tui/commands.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/runtime/runtime-session.ts`
- Modify: `src/runtime/service/protocol/runtime-command-schema.ts`
- Modify: `src/runtime/service/runtime-command-handler.ts`
- Modify: `src/interface/runtime/remote-kernel.ts`
- Test: `tests/interface/commands.test.ts`
- Test: `tests/interface/remote-kernel.test.ts`
- Test: `tests/runtime/api-compliance.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- `/plan foo` parses to a dedicated planning command or planning submit intent, not just a plain text payload
- the remote kernel forwards a real planning command path, not a prefixed string such as `plan: foo`
- runtime command schema accepts the planning command shape
- the runtime command handler maps planning intent into the existing planner entrypoint without breaking normal `add_task`

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/remote-kernel.test.ts tests/runtime/api-compliance.test.ts
```

Expected: FAIL because `/plan` still compiles down to a plain submit string.

- [ ] **Step 3: Implement the planning intent contract**

Use a dedicated command shape, for example:

```ts
type RuntimeCommand =
  | { kind: "add_task"; content: string; background?: boolean }
  | { kind: "plan_task"; content: string };
```

And on the TUI side:

```ts
type TuiParsedInput =
  | { kind: "submit"; text: string }
  | { kind: "plan"; text: string }
  | { kind: "command"; name: ... };
```

Keep the implementation minimal by reusing existing planner routing internally where possible.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/remote-kernel.test.ts tests/runtime/api-compliance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/commands.ts src/interface/tui/app.tsx src/interface/runtime/runtime-session.ts src/runtime/service/protocol/runtime-command-schema.ts src/runtime/service/runtime-command-handler.ts src/interface/runtime/remote-kernel.ts tests/interface/commands.test.ts tests/interface/remote-kernel.test.ts tests/runtime/api-compliance.test.ts
git commit -m "feat: promote plan to an explicit runtime intent"
```

## Task 2: Surface Current Task Stage In The TUI

**Files:**
- Modify: `src/interface/runtime/runtime-session.ts`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/components/status-bar.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- the TUI can show `planning`, `awaiting_confirmation`, `executing`, and `blocked` as explicit stages
- planning submissions render a planning stage instead of looking identical to ordinary execute tasks
- the stage indicator remains visible while the main stream continues to be the primary content

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/tui-app.test.tsx
```

Expected: FAIL because the current UI only shows generic model or blocked state, not task phase.

- [ ] **Step 3: Implement stage derivation and display**

Add a stable stage field to the TUI-facing session model, for example:

```ts
type SessionStage = "idle" | "planning" | "awaiting_confirmation" | "executing" | "blocked";
```

Derive it from session data plus command intent, then render it in a lightweight, always-visible place such as the header or status bar.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/runtime/runtime-session.ts src/interface/tui/app.tsx src/interface/tui/screen.tsx src/interface/tui/components/status-bar.tsx tests/interface/tui-app.test.tsx
git commit -m "feat: surface task stage in the tui shell"
```

## Task 3: Add Slash Command Suggestions To The Composer

**Files:**
- Create: `src/interface/tui/components/command-suggestions.tsx`
- Modify: `src/interface/tui/components/composer.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/view-state.ts`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- typing `/` opens a suggestion list under the composer
- typing `/se` filters down to `/sessions` and `/settings`
- arrow keys move the active selection
- selecting `/plan` inserts `/plan ` into the composer instead of immediately executing
- selecting `/help` or `/sessions` executes immediately
- pressing `Esc` closes the suggestion list without submitting

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/tui-app.test.tsx
```

Expected: FAIL because the composer currently parses only after submit.

- [ ] **Step 3: Implement the suggestion state machine**

Introduce a command definition table, for example:

```ts
type SlashCommandDefinition = {
  name: "/plan";
  description: string;
  acceptsArgs: boolean;
};
```

Track:

- current slash query
- filtered command list
- highlighted index
- whether a selection should execute immediately or complete the input

Keep the list visually attached below the input region.

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/components/command-suggestions.tsx src/interface/tui/components/composer.tsx src/interface/tui/app.tsx src/interface/tui/view-state.ts tests/interface/commands.test.ts tests/interface/tui-app.test.tsx
git commit -m "feat: add slash command suggestions to the composer"
```

## Task 4: Add JSON-Backed Global And Project Config Resolution

**Files:**
- Create: `src/interface/tui/settings/config-types.ts`
- Create: `src/interface/tui/settings/config-store.ts`
- Create: `src/interface/tui/settings/config-resolver.ts`
- Test: `tests/interface/settings-config.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- global config loads from a user JSON file
- project config loads from a workspace JSON file
- effective values resolve using `Project > Global`
- missing files fall back cleanly to defaults
- saving global config does not overwrite project config and vice versa

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/settings-config.test.ts
```

Expected: FAIL because no config store exists yet.

- [ ] **Step 3: Implement the config store and resolver**

Use a simple JSON-backed model such as:

```ts
type TuiUserConfig = {
  autoCompact: boolean;
  showTips: boolean;
  reduceMotion: boolean;
  thinkingMode: boolean;
  promptSuggestions: boolean;
  verboseOutput: boolean;
  terminalProgressBar: boolean;
};
```

Provide:

- read global config
- read project config
- write global config
- write project config
- resolve effective value + source layer

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/settings-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/settings/config-types.ts src/interface/tui/settings/config-store.ts src/interface/tui/settings/config-resolver.ts tests/interface/settings-config.test.ts
git commit -m "feat: add json-backed tui config resolution"
```

## Task 5: Build The Interactive Settings Pane

**Files:**
- Create: `src/interface/tui/components/settings-pane.tsx`
- Modify: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/view-state.ts`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add assertions that:

- opening `/settings` shows `Status | Config | Usage` tabs
- `Config` defaults to global editing scope
- there is an explicit entry to switch into project config editing
- `/` inside settings enters settings search, not slash-command mode
- `Space` toggles a boolean row
- `Enter` saves the edited JSON file
- `Esc` cancels and returns to the normal shell

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
bun test tests/interface/tui-app.test.tsx
```

Expected: FAIL because `/settings` is still a static utility pane.

- [ ] **Step 3: Implement the settings interaction model**

Create a dedicated pane state, for example:

```ts
type SettingsViewState = {
  tab: "status" | "config" | "usage";
  scope: "global" | "project";
  searchQuery: string;
  selectedIndex: number;
  dirty: boolean;
};
```

Rules:

- default tab: `config`
- default scope: `global`
- status tab is read-only
- usage tab is read-only
- config tab supports search, toggle, save

- [ ] **Step 4: Run the focused tests to verify pass**

Run:

```bash
bun test tests/interface/tui-app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/components/settings-pane.tsx src/interface/tui/components/utility-pane.tsx src/interface/tui/app.tsx src/interface/tui/view-state.ts src/interface/tui/screen.tsx tests/interface/tui-app.test.tsx
git commit -m "feat: add interactive tui settings pane"
```

## Task 6: Update Usage Help And Verify End To End

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-tui-plan-and-settings-design.md`
- Modify: `docs/superpowers/plans/2026-04-06-tui-plan-and-settings-implementation.md`
- Modify: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/components/status-bar.tsx`

- [ ] **Step 1: Run the focused interface suites**

Run:

```bash
bun test tests/interface/commands.test.ts tests/interface/confirmation-flow.test.tsx tests/interface/remote-kernel.test.ts tests/interface/runtime-session.test.ts tests/interface/tui-app.test.tsx tests/interface/settings-config.test.ts tests/runtime/api-compliance.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Sync docs if implementation required justified deviations**

Update the spec or plan only if the shipped behavior diverges from the approved design in a meaningful way.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-tui-plan-and-settings-design.md docs/superpowers/plans/2026-04-06-tui-plan-and-settings-implementation.md src/interface/tui/components/utility-pane.tsx src/interface/tui/components/status-bar.tsx
git commit -m "docs: finalize tui plan and settings implementation"
```
