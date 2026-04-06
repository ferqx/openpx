# Welcome Pane Redesign

Date: 2026-04-06
Status: Draft for review

## Goal

Redesign the TUI welcome pane to feel close to Claude's welcome screen in both structure and tone, while remaining appropriate for an Ink-based terminal UI.

The redesigned welcome pane should:

- remove shell-like chrome from the first impression
- use a centered, quiet layout with generous vertical breathing room
- keep the screen focused on starting a conversation
- provide a small set of lightweight prompt suggestions

The redesign should not:

- add new navigation, settings, or dashboard behavior
- introduce heavy borders, dense utility text, or status-heavy panels
- move the main composer away from the bottom input area

## Confirmed Product Direction

The user approved the following direction:

- match Claude's welcome screen in both structure and overall feel
- use a low-density welcome screen with light prompt-entry suggestions
- avoid carrying forward the previous "Fresh launch" and utility-card framing

## UX Summary

The welcome state should read as a blank but guided starting point.

The screen will have three layers only:

1. A centered headline
2. A single muted supporting sentence
3. A short row or stack of 3 to 4 suggestion prompts

The composer remains the real primary action and stays at the bottom of the screen.

## Layout

## Overall Structure

When `showWelcome` is true, the main stream region should render a vertically centered welcome composition instead of the current top-aligned placeholder.

The welcome composition should occupy the visual center of the available content area above the composer and above the dim status line.

## Content Blocks

### Headline

The headline should be short and calm. It should not read like a marketing slogan or a technical status line.

Examples of acceptable tone:

- "How can openpx help?"
- "What are we working on?"

The final copy can be chosen during implementation, but it must remain short and neutral.

### Supporting Line

One sentence only. It should explain that the user can ask openpx to work on code tasks in this workspace, without sounding procedural or noisy.

It should avoid:

- mentioning "fresh launch"
- describing system internals
- listing commands inline

### Suggestions

Render 3 to 4 suggestion prompts beneath the supporting line.

These suggestions should:

- look lightweight, closer to Claude suggestions than command cards
- be phrased as natural requests, not slash commands
- fit openpx's coding workflow

Suggested content style:

- "Plan a refactor for this repo"
- "Find the bug causing this failure"
- "Summarize the current workspace"
- "Implement a small feature safely"

They do not need to be clickable in this iteration. Static display is sufficient.

## Visual Design

## Tone

The screen should feel quiet, centered, and minimal.

## Color

- Headline: soft primary emphasis is acceptable, but avoid strong saturation
- Supporting line: dim
- Suggestions: dim or near-dim, with one subtle emphasis treatment at most
- Avoid bright yellow warning styles, boxed utility emphasis, and dense separators

## Borders and Decoration

- Do not use the previous boxed "Quick actions" card
- Avoid heavy borders around suggestion items
- Prefer spacing and alignment over framing

## Terminal Constraints

Because this is Ink in a terminal:

- suggestions may be rendered as simple padded text rows rather than true cards
- layout must degrade cleanly in narrow terminals
- centered composition should still remain readable in smaller heights

## Component Design

## `WelcomePane`

`WelcomePane` should become a self-contained presentation component responsible for:

- headline copy
- supporting copy
- suggestion list rendering
- width-aware centered layout

Inputs should remain minimal. The current `workspaceRoot` and `projectId` props may remain available, but the redesigned pane should not surface them in the initial welcome view.

## `Screen`

`Screen` should treat welcome mode as a centered layout state, not just a different child component in a top-aligned stream container.

Implementation may adjust `justifyContent`, inner wrappers, or layout structure so the welcome pane sits visually in the middle of the content region.

## Responsiveness

## Wide Terminals

- keep the composition compact instead of stretching edge to edge
- cap the content width so the screen still feels focused

## Narrow Terminals

- stack suggestion items vertically
- allow tighter spacing
- preserve clear reading order: headline, supporting line, suggestions

## Testing

Add or update interface tests to verify:

- the old "Fresh launch" welcome copy is removed
- the old boxed quick-actions treatment is removed
- the new welcome pane renders centered-style content with new headline and suggestion copy
- the composer placeholder remains present below the welcome state

Tests should assert user-visible text outcomes, not implementation details of spacing internals.

## Non-Goals

- clickable suggestion interactions
- keyboard navigation between suggestion items
- dynamic suggestion generation
- changes to the bottom composer behavior
- changes to the status bar beyond preserving its lower visual priority

## Implementation Notes

- keep the welcome pane visually minimal
- avoid introducing a new dense component hierarchy for a simple screen
- prefer a few clear layout wrappers over nested decorative boxes
- preserve compatibility with the existing `Screen` and `App` welcome-state flow
