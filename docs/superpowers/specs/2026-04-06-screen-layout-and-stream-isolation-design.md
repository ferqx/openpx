# Screen Layout And Stream Isolation

Date: 2026-04-06
Status: Draft for review

## Goal

Refactor the TUI `Screen` layout skeleton and state boundaries so that:

- layout no longer depends on broad hand-estimated row accounting for every region
- long list regions still retain scroll behavior
- streaming assistant output does not cause unrelated list regions to re-render on every chunk

This redesign applies to the `App` → `Screen` rendering path, including:

- main conversation stream
- utility panes such as sessions/history/settings
- thread panel
- composer and status footer integration

## Confirmed Direction

The user approved the following constraints:

- refactor the whole `Screen` layout skeleton, not only welcome mode
- long session/history lists must remain scrollable
- during AI streaming, both the main message area and utility/list regions currently re-render per chunk, and that behavior must be fixed

## Current Problems

## 1. Over-centralized layout accounting

`Screen` currently computes a broad set of fixed row estimates such as:

- `composerRows`
- `statusRows`
- `threadPanelRows`
- `overlayRows`
- `blockedRows`

It then derives a single `mainHeight` and uses it as a hard layout constraint for the stream region.

This causes two classes of problems:

- the layout is brittle when content shape changes
- isolated visual changes can destabilize unrelated panes

## 2. Coarse render invalidation during streaming

Streaming events such as `stream.text_chunk`, `stream.thinking_chunk`, and `model.status` currently update state in a way that causes the whole screen tree to refresh.

This means:

- the main conversation stream updates, which is necessary
- utility list panes also refresh, which is unnecessary
- thread/session/history style regions visibly redraw during token streaming

## 3. Layout and render concerns are coupled

`Screen` currently mixes:

- layout orchestration
- content region selection
- height budgeting
- render participation for all regions

That makes it hard to change layout without accidentally changing repaint behavior.

## Desired Outcome

The new rendering model should satisfy all of the following:

1. The screen uses a clearer flex-based skeleton
2. Only genuinely scrollable regions receive explicit viewport constraints
3. Utility/list panes keep scroll behavior
4. Streaming updates affect only the conversation region and directly related status indicators
5. Utility panes and thread lists do not repaint on every stream chunk

## Architecture

## Screen Regions

The `Screen` should be treated as four compositional regions:

1. Optional thread panel
2. Main content region
3. Optional utility/settings region
4. Footer region containing composer and status

The important change is that layout responsibility becomes structural rather than row-budget-driven.

## Main Content Region

The main content region should be the primary flex-growing region.

It can render one of:

- welcome pane
- interaction stream

This region should retain explicit viewport inputs only where needed for internal scrolling behavior, not because the outer layout requires a single manually estimated height for everything else.

## Utility Region

Utility panes such as:

- sessions
- history
- settings

should remain below the main content region and above the footer.

These panes still need bounded viewport height when open, because sessions/history can overflow and must remain scrollable. However, that bounded height should be local to the utility region rather than entangled with the whole screen’s rendering logic.

## Footer Region

Composer and status bar stay at the bottom.

They should remain stable layout participants and should not depend on token-by-token streaming updates unless their own inputs change.

## State Boundary Redesign

## High-Frequency Conversation State

Introduce a dedicated conversation-oriented view state derived from `session` and streaming state.

This state is responsible for:

- rendered conversation messages
- transient streamed assistant output
- thinking content
- model status
- conversation performance indicators
- conversation scroll offset
- narrative fallback for the main stream

Only the conversation region should subscribe to this high-frequency state.

## Stable Utility State

Introduce a dedicated utility-oriented view state responsible for:

- active utility pane mode
- selected session index
- utility session snapshot
- thread summaries
- settings pane data

This state should not change during normal token streaming unless its own backing data changes.

## Screen Composition Inputs

`Screen` should receive separated props representing distinct render domains, for example:

- `conversationView`
- `utilityView`
- `composerView`
- `chromeView`

The exact naming can differ, but the separation must be explicit.

The purpose is to stop the whole screen from being effectively subscribed to the same constantly changing object graph.

## Memoization And Stability

## Stable Props

`InteractionStream`, `UtilityPane`, and `ThreadPanel` should be fed the smallest possible prop surface.

Avoid regenerating arrays and objects on every streaming event for regions whose content has not changed.

## Component Memoization

Apply `React.memo` to presentation components where it is meaningful, especially:

- `UtilityPane`
- `ThreadPanel`
- potentially `StatusBar`

Do not rely on memoization alone as the main fix. Memoization is a guardrail; the real fix is reducing cross-region state churn.

## Scroll Behavior Requirements

## Sessions / History

If session or history lists exceed the visible space, the pane must keep working as a scrollable bounded region.

This behavior is mandatory and must not regress during layout simplification.

## Main Conversation Stream

The conversation stream must retain its existing scroll behavior and indicators such as:

- `history ↑`
- `live ↓`

These indicators should continue to be driven by the stream viewport logic.

## Welcome Pane

The welcome pane does not require dedicated scrolling behavior beyond normal clipping in extremely short terminals. It should not be the reason the entire screen stays row-budgeted.

## Testing Strategy

## Layout And Behavior Tests

Add or update tests to verify:

- long sessions/history panes remain scrollable
- settings pane still appears in the correct region below the main stream
- welcome and conversation modes still render in the expected order

## Render Isolation Tests

Add focused tests proving that streaming does not re-render unrelated list regions.

Recommended approach:

- instrument `UtilityPane` and/or `ThreadPanel` with render-count observation in tests
- simulate multiple `stream.text_chunk` events
- assert that the conversation region updates while utility/list render counts remain stable

The tests should verify behavior, not implementation trivia.

## Non-Goals

- redesigning welcome copy again
- changing slash command semantics
- changing the durable runtime/session protocol
- introducing clickable welcome prompts
- refactoring every TUI component into separate files beyond what is needed for clear render boundaries

## Implementation Notes

- prefer a structural layout cleanup over more row-estimation patches
- keep scroll logic local to the regions that truly need it
- reduce prop fan-out from `App` to `Screen`
- preserve current user-visible behavior unless it is directly part of this redesign’s goals
