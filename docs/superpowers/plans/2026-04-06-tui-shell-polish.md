# TUI Shell Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the TUI shell to feel closer to Claude/Codex style while preserving thread and runtime controls.

**Architecture:** Keep `App` state ownership unchanged and focus polish work in the presentation layer. Update the shell chrome, composer, utility panes, and thread panel so the message stream remains dominant and supporting controls read like overlays rather than page switches.

**Tech Stack:** Bun, React 19, Ink 6, bun:test, ink-testing-library

---

### Task 1: Lock visual shell behavior with tests

**Files:**
- Modify: `tests/interface/tui-app.test.tsx`
- Modify: `tests/interface/composer.test.tsx`
- Modify: `tests/interface/thread-panel.test.tsx`
- Test: `tests/interface/tui-app.test.tsx`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run targeted tests to verify they fail**
- [ ] **Step 3: Implement minimal presentation changes**
- [ ] **Step 4: Re-run targeted tests to verify they pass**

### Task 2: Polish shell chrome and overlays

**Files:**
- Modify: `src/interface/tui/screen.tsx`
- Modify: `src/interface/tui/components/utility-pane.tsx`
- Modify: `src/interface/tui/components/thread-panel.tsx`
- Modify: `src/interface/tui/components/status-bar.tsx`

- [ ] **Step 1: Convert utility panes into bordered overlay cards with terse metadata**
- [ ] **Step 2: Compress thread list rows into single-line summaries**
- [ ] **Step 3: Keep status chrome thin and secondary to the conversation**
- [ ] **Step 4: Re-run TUI interaction tests**

### Task 3: Polish composer and command palette

**Files:**
- Modify: `src/interface/tui/components/composer.tsx`
- Modify: `src/interface/tui/components/command-suggestions.tsx`
- Test: `tests/interface/composer.test.tsx`

- [ ] **Step 1: Restyle composer as the main focal region**
- [ ] **Step 2: Restyle slash suggestions as a compact command palette**
- [ ] **Step 3: Verify keyboard navigation still works**

### Task 4: Verify project health

**Files:**
- Modify: `src/interface/tui/components/interaction-stream.tsx`

- [ ] **Step 1: Run `bun test`**
- [ ] **Step 2: Run `bun run typecheck`**
