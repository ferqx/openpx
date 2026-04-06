# Welcome Pane Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the TUI welcome pane into a Claude-like minimal first-run screen with centered headline, muted supporting copy, and lightweight suggestion prompts.

**Architecture:** Keep the current `App` and `Screen` welcome-state flow, but redesign the presentation layer so `Screen` treats welcome mode as a centered layout state and `WelcomePane` becomes a focused component that renders only the approved headline, supporting line, and prompt suggestions. Drive the work with interface tests first so the old "Fresh launch" shell and boxed quick-actions treatment are removed by behavior, not by assumption.

**Tech Stack:** TypeScript, React 19, Ink 6, Bun test, ink-testing-library

---

### Task 1: Lock In The New Welcome Copy And Remove Legacy Copy

**Files:**
- Modify: `tests/interface/tui-app.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing test assertions for the new welcome content**

Update the existing fresh-launch test so it asserts the new welcome outcome instead of the old shell copy.

Expected assertions:

```tsx
expect(frame).toContain("How can openpx help?");
expect(frame).toContain("Ask openpx to plan, debug, or implement work in this workspace.");
expect(frame).toContain("Plan a refactor for this repo");
expect(frame).toContain("Find the bug causing this failure");
expect(frame).not.toContain("Fresh launch");
expect(frame).not.toContain("Quick actions");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/interface/tui-app.test.tsx`

Expected: FAIL because the current welcome pane still renders `Open conversation` / `Fresh launch` and lacks the new suggestion copy.

- [ ] **Step 3: Commit**

```bash
git add tests/interface/tui-app.test.tsx
git commit -m "test: define new welcome pane copy"
```

### Task 2: Redesign `WelcomePane` Into The Minimal Claude-Like Layout

**Files:**
- Modify: `src/interface/tui/components/welcome-pane.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the minimal implementation for the new welcome content**

Replace the existing placeholder markup with a focused component structure:

```tsx
const suggestions = [
  "Plan a refactor for this repo",
  "Find the bug causing this failure",
  "Summarize the current workspace",
  "Implement a small feature safely",
];

return (
  <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
    <Box width={contentWidth} flexDirection="column" alignItems="center">
      <Text color={theme.colors.agent}>How can openpx help?</Text>
      <Text color={theme.colors.dim}>
        Ask openpx to plan, debug, or implement work in this workspace.
      </Text>
      {suggestions.map((suggestion) => (
        <Text key={suggestion} color={theme.colors.dim}>
          {suggestion}
        </Text>
      ))}
    </Box>
  </Box>
);
```

Implementation notes:
- keep `workspaceRoot` / `projectId` props available only if needed for future evolution, but do not render them
- avoid bordered cards and avoid command-style slash shortcuts
- keep the headline calm, not bold marketing copy

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test tests/interface/tui-app.test.tsx`

Expected: the welcome-launch assertions for the new copy pass, though additional layout-focused tests may still be missing.

- [ ] **Step 3: Commit**

```bash
git add src/interface/tui/components/welcome-pane.tsx tests/interface/tui-app.test.tsx
git commit -m "feat: redesign welcome pane content"
```

### Task 3: Center The Welcome State In `Screen`

**Files:**
- Modify: `tests/interface/screen.test.tsx`
- Modify: `src/interface/tui/screen.tsx`
- Test: `tests/interface/screen.test.tsx`

- [ ] **Step 1: Write the failing screen-level test for centered welcome state behavior**

Add or extend a screen test that verifies the welcome state renders the new headline and no longer shows the old boxed quick-actions treatment.

Suggested assertions:

```tsx
expect(frame).toContain("How can openpx help?");
expect(frame).toContain("Plan a refactor for this repo");
expect(frame).not.toContain("Quick actions");
expect(frame).toContain("Ask openpx... Press / for commands");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/interface/screen.test.tsx`

Expected: FAIL until `Screen` gives the welcome pane an actual centered content region and the old layout no longer leaks through.

- [ ] **Step 3: Write the minimal screen layout change**

Update `Screen` so the welcome state uses a centered layout wrapper instead of the current top-anchored stream behavior.

Implementation target:

```tsx
<Box
  key="stream"
  height={mainHeight}
  overflow="hidden"
  flexDirection="column"
  justifyContent={input.showWelcome ? "center" : "flex-end"}
>
  {input.showWelcome ? (
    <WelcomePane workspaceRoot={input.workspaceRoot} projectId={input.projectId} />
  ) : (
    <InteractionStream ... />
  )}
</Box>
```

Refine with one extra inner wrapper if needed to keep the composition compact in tall terminals.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/interface/screen.test.tsx`

Expected: PASS with the new welcome content still present and the composer still visible below the welcome region.

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/screen.tsx tests/interface/screen.test.tsx
git commit -m "feat: center welcome pane layout"
```

### Task 4: Tighten Styling And Responsive Presentation

**Files:**
- Modify: `src/interface/tui/components/welcome-pane.tsx`
- Modify: `src/interface/tui/theme.ts` (only if an extra soft color token is truly necessary)
- Test: `tests/interface/screen.test.tsx`

- [ ] **Step 1: Write a failing assertion for the final lightweight suggestion treatment if still needed**

If the first implementation still renders visually heavy framing or legacy labels, add one more assertion to lock in the final visible text shape.

Example:

```tsx
expect(frame).not.toContain("Open conversation");
expect(frame).not.toContain("/sessions");
```

- [ ] **Step 2: Run targeted tests to verify it fails for the right reason**

Run: `bun test tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx`

Expected: FAIL only if leftover legacy copy or utility text remains.

- [ ] **Step 3: Apply minimal visual cleanup**

Finalize the welcome pane presentation:
- cap content width on wider terminals
- keep suggestions stacked and lightly spaced
- use dim / near-dim text for support and suggestions
- avoid introducing heavy borders or separators

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `bun test tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/interface/tui/components/welcome-pane.tsx src/interface/tui/theme.ts tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx
git commit -m "style: polish welcome pane presentation"
```

### Task 5: Regression Verification

**Files:**
- Test: `tests/interface/markdown.test.tsx`
- Test: `tests/interface/status-bar.test.tsx`
- Test: `tests/interface/screen.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Run the focused interface regression suite**

Run:

```bash
bun test tests/interface/markdown.test.tsx tests/interface/status-bar.test.tsx tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx
```

Expected: PASS, or only known pre-existing unrelated failures that are documented before merge.

- [ ] **Step 2: Run typecheck and record any unrelated baseline failures**

Run: `bun run typecheck`

Expected: If typecheck still fails, failures should remain limited to the existing `RuntimeSessionState.messages` baseline issues already present in the repo, not new welcome-pane regressions.

- [ ] **Step 3: Commit**

```bash
git add src/interface/tui/components/welcome-pane.tsx src/interface/tui/screen.tsx tests/interface/screen.test.tsx tests/interface/tui-app.test.tsx
git commit -m "test: verify welcome pane redesign"
```

### Task 6: Optional Follow-Up If Suggestion Interaction Is Later Requested

**Files:**
- Modify: `src/interface/tui/components/welcome-pane.tsx`
- Modify: `src/interface/tui/components/composer.tsx`
- Test: `tests/interface/screen.test.tsx`

- [ ] **Step 1: Do nothing in this plan**

Suggestion interactivity is explicitly out of scope for this iteration. Leave the suggestions as static text.
