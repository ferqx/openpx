# Screen Layout And Stream Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the TUI screen layout and render-state boundaries so scrollable panes remain correct while streaming updates stop forcing unrelated list regions to re-render.

**Architecture:** Split the work into two layers: first reshape `Screen` into a clearer flex-based layout skeleton with scroll constraints local to the regions that need them, then split high-frequency conversation view state from stable utility/chrome view state so `UtilityPane`, `ThreadPanel`, and similar regions no longer participate in every stream chunk update. Preserve current user-visible behavior unless the redesign explicitly targets it.

**Tech Stack:** TypeScript, React 19, Ink 6, Bun test, ink-testing-library

---

### Task 1: Lock The Current Scroll And Placement Requirements In Tests

**Files:**
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/interface/screen.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/screen.test.tsx`

- [ ] **Step 1: Write failing or tightened assertions for layout invariants**

Extend the existing interface tests so they explicitly lock in the behavior that must survive the refactor:

- sessions pane still renders when opened from the welcome shell
- history pane still renders current-thread answer content
- settings pane still appears below the main content region
- welcome shell still renders before utility panes open
- screen test still verifies welcome ordering and absence of legacy shell chrome

Suggested additions:

```tsx
expect(frame).toContain("thread-blocked");
expect(frame).toContain("Most recent answer from the current thread.");
expect(frame.indexOf("How can openpx help?")).toBeLessThan(frame.indexOf("Status   [Config]   Usage"));
```

- [ ] **Step 2: Run targeted tests to verify they fail or meaningfully constrain the refactor**

Run:

```bash
bun test tests/interface/screen.test.tsx
bun test tests/interface/tui-app.test.tsx --test-name-pattern "welcome shell|welcome state|hydrated.*welcome|thread panel hidden|local sessions pane|local history pane|settings pane below the main stream"
```

Expected: either current PASS with stronger coverage or FAIL if the new assertions expose missing guarantees. If already PASS, proceed with them as the safety net.

- [ ] **Step 3: Commit**

```bash
git add tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx
git commit -m "test: lock screen layout invariants"
```

### Task 2: Refactor `Screen` Into A Clearer Flex Skeleton

**Files:**
- Modify: `src/interface/tui/screen.tsx`
- Test: `tests/interface/screen.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the minimal structural refactor**

Rework `Screen` so it is explicitly composed into:

1. optional thread panel
2. main content region
3. optional utility/settings region
4. footer region

The main content region should be the primary flex-growing area. Only the utility region and stream internals should receive bounded viewport constraints where needed.

Implementation target:

```tsx
<Box flexDirection="column" height="100%" paddingX={1}>
  {showThreadPanel ? <ThreadPanel ... /> : null}

  <Box flexGrow={1} minHeight={6} flexDirection="column" overflow="hidden">
    {showWelcome ? <WelcomePane ... /> : <InteractionStream ... />}
  </Box>

  {showUtilityPane ? <UtilityPaneContainer ... /> : null}
  {showSettingsPane ? <SettingsPaneContainer ... /> : null}

  <Composer ... />
  <StatusBar ... />
</Box>
```

Important constraints:

- remove as much broad row-budget math as possible
- keep utility pane height budgeting local to the utility region
- do not break stream scroll indicators

- [ ] **Step 2: Run targeted tests to verify the layout still behaves correctly**

Run:

```bash
bun test tests/interface/screen.test.tsx
bun test tests/interface/tui-app.test.tsx --test-name-pattern "welcome shell|welcome state|hydrated.*welcome|thread panel hidden|local sessions pane|local history pane|settings pane below the main stream"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/interface/tui/screen.tsx tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx
git commit -m "refactor: simplify screen layout skeleton"
```

### Task 3: Split Conversation View State From Utility/Chrome View State

**Files:**
- Modify: `src/interface/tui/app.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/view-state.ts` (if helpful for typed view slices)
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write a failing or expanded test that proves streaming should not disturb utility visibility**

Add a focused test that:

- opens a utility pane such as sessions
- emits multiple `stream.text_chunk` events
- asserts the utility pane remains visible and stable while the conversation stream changes

Suggested skeleton:

```tsx
await typeAndSubmit(stdin, "/sessions");
emit?.({ type: "stream.text_chunk", payload: { content: "partial", index: 0 } });
emit?.({ type: "stream.text_chunk", payload: { content: " more", index: 1 } });
expect(lastFrame()).toContain("thread-blocked");
```

This is not yet a render-count test, but it protects behavior while the state split happens.

- [ ] **Step 2: Run the focused test to verify the current implementation is vulnerable or insufficient**

Run: `bun test tests/interface/tui-app.test.tsx --test-name-pattern "streaming.*utility|sessions.*stream|utility.*stream"`

Expected: likely FAIL until the state split is in place, or PASS but still justify the stronger next task.

- [ ] **Step 3: Introduce explicit view-state slices in `App`**

Derive separate view objects such as:

```ts
const conversationView = { ... };
const utilityView = { ... };
const chromeView = { ... };
const composerView = { ... };
```

Rules:

- high-frequency stream changes only update `conversationView`
- utility pane data only changes when utility inputs change
- thread panel data only changes when thread summaries change

- [ ] **Step 4: Pass split props into `Screen`**

Adjust `Screen` to accept separated domains rather than one broad implicit state bundle.

The exact prop names may differ, but the high-frequency and stable domains must be isolated.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
bun test tests/interface/tui-app.test.tsx --test-name-pattern "welcome shell|local sessions pane|local history pane|settings pane below the main stream|streaming.*utility|sessions.*stream|utility.*stream"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/interface/tui/app.tsx src/interface/tui/screen.tsx src/interface/tui/view-state.ts tests/interface/tui-app.test.tsx
git commit -m "refactor: isolate conversation and utility view state"
```

### Task 4: Add Render-Isolation Guards With Memoized Stable Components

**Files:**
- Modify: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/components/thread-panel.tsx`
- Modify: `src/interface/tui/components/status-bar.tsx`
- Test: `tests/interface/screen-render-isolation.test.tsx`

- [ ] **Step 1: Add a dedicated failing render-isolation test**

Create a new test file that instruments utility and thread-list rendering.

Recommended pattern:

- wrap `UtilityPane` and/or `ThreadPanel` in a render counter
- render the app/screen
- emit several `stream.text_chunk` events
- assert that the conversation view changes but unrelated region render counts do not increase per chunk

Pseudo-shape:

```tsx
let utilityRenderCount = 0;
mockUtilityPane(() => {
  utilityRenderCount += 1;
  return <OriginalUtilityPane ... />;
});

emit?.({ type: "stream.text_chunk", payload: { content: "a", index: 0 } });
emit?.({ type: "stream.text_chunk", payload: { content: "b", index: 1 } });

expect(utilityRenderCount).toBe(initialRenderCount);
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `bun test tests/interface/screen-render-isolation.test.tsx`

Expected: FAIL because utility/thread regions still re-render during streaming.

- [ ] **Step 3: Apply `React.memo` and prop narrowing**

Wrap presentation-only stable components where appropriate:

- `UtilityPane`
- `ThreadPanel`
- optionally `StatusBar`

At the same time, ensure they receive the narrowest stable prop set possible. Do not pass large fresh objects when only one scalar is needed.

- [ ] **Step 4: Run the render-isolation test again**

Run: `bun test tests/interface/screen-render-isolation.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/components/utility-pane.tsx src/interface/tui/components/thread-panel.tsx src/interface/tui/components/status-bar.tsx tests/interface/screen-render-isolation.test.tsx
git commit -m "perf: prevent utility pane redraws during streaming"
```

### Task 5: Full Focused Regression And Typecheck

**Files:**
- Test: `tests/interface/screen.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/screen-render-isolation.test.tsx`

- [ ] **Step 1: Run the focused interface regression suite**

Run:

```bash
bun test tests/interface/markdown.test.tsx tests/interface/status-bar.test.tsx tests/interface/screen.test.tsx tests/interface/screen-render-isolation.test.tsx
bun test tests/interface/tui-app.test.tsx --test-name-pattern "welcome shell|welcome state|hydrated.*welcome|thread panel hidden|local sessions pane|local history pane|settings pane below the main stream|streaming.*utility|sessions.*stream|utility.*stream"
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/interface/tui/app.tsx src/interface/tui/screen.tsx src/interface/tui/components/utility-pane.tsx src/interface/tui/components/thread-panel.tsx src/interface/tui/components/status-bar.tsx tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx tests/interface/screen-render-isolation.test.tsx
git commit -m "test: verify screen layout and stream isolation"
```

### Task 6: Explicitly Leave Non-Goals Alone

**Files:**
- No code changes expected

- [ ] **Step 1: Do not expand scope**

Do not include:

- welcome copy redesign
- slash command redesign
- runtime protocol changes
- interactive welcome prompt actions
