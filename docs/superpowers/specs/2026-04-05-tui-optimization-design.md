# TUI Optimization Design

## Overview

Four targeted improvements to the openpx TUI: new session per launch, thinking process display, status bar redesign, and markdown rendering.

## Design Decisions

| Area | Current | After |
|---|---|---|
| Session | `thread_new` pre-call + thread reuse logic | Remove pre-call, `submit_input` auto-creates new thread |
| Thinking | Not shown | Display `thinking_chunk` text in gray before agent reply |
| Status bar | Thread ID + IDLE/CONNECTED (red bg) | Model name + thinking level + context % + workspace root |
| Markdown | Raw markdown text displayed | Rendered via `ink-markdown` (lists, code blocks, tables, links) |

## Section 1: New Session Per Launch

**Current behavior:**
`main.ts:58` calls `await remoteKernel.handleCommand({ type: "thread_new" })` before mounting the TUI. This creates a new thread, but is redundant because `submit_input` already creates a new thread when no usable one exists.

**Change:**
- Remove the `thread_new` pre-call from `main.ts`
- `submit_input` in `session-kernel.ts:241` already handles thread creation: if no latest thread exists or latest is failed, it creates a new one
- Historical threads remain accessible via `thread_list` command

**No behavior change for users** — each launch still gets a fresh thread, but the implementation is cleaner.

## Section 2: Thinking Process Display

**Reference:** Claude Code shows thinking collapsed by default with `⟐ Thinking (1.2s, 340 tokens)`. DeepSeek/Qwen show raw `<think>` blocks.

**openpx approach:** Display thinking text inline, before agent reply, no icon prefix.

```
❯ 分析项目结构

  Thinking (2.1s)
  用户要求分析项目结构，我需要先查看 package.json 了解项目类型，
  然后读取目录结构，最后给出分析报告...

  Agent: 当前项目是一个 Agent OS，基于 LangGraph 构建。
```

**Display rules:**
- Thinking text shown in gray, indented
- Separated from agent reply by spacing
- Shows duration (time from `thinking_started` to first `text_chunk`)
- If model doesn't support thinking (no `thinking_chunk` events), this section is not shown
- Thinking content appears progressively as `stream.thinking_chunk` events arrive

**Data source:** `stream.thinking_chunk` events from `StreamEventAdapter`, which maps LangGraph's reasoning/thinking blocks.

## Section 3: Status Bar Redesign

**Current:**
```
OPENPX | 7a706c0c    IDLE    CONNECTED
```
Red background, thread ID, model status, runtime status.

**New:**
```
kimi-k2.5 | 推理:高 | ctx:-- | /Users/chenchao/Code/ai/openpx
```

**Fields:**
| Field | Source | Notes |
|---|---|---|
| Model name | Config `model.name` | e.g. `kimi-k2.5` |
| Thinking level | User config | `高` / `中` / `低` / `默认` / `—` (model doesn't support). User-configurable setting. Models that don't support thinking config show `—` |
| Context % | Model usage metadata | Percentage of context window used. Shows `--` if not available |
| Workspace root | Config `workspaceRoot` | Truncated if too long |

**Removed:**
- Thread ID (available via `thread_list`)
- IDLE/CONNECTED status text
- Red background

**Thinking level config:**
- User sets via config file: `thinking: "high" | "medium" | "low" | "off"`
- Future: official presets for common models auto-apply appropriate defaults
- Display maps to Chinese: 高/中/低/默认/—

## Section 4: Markdown Rendering

**Current problem:**
Agent replies contain raw markdown syntax (`**bold**`, `- list`, `` `code` ``) displayed as-is in the TUI.

**Solution:**
Use `ink-markdown` package to render markdown content.

**Supported formats:**
- Bold/italic text
- Lists (ordered and unordered)
- Code blocks (with visual distinction, no syntax highlighting needed)
- Inline code
- Tables (aligned text)
- Links (show URL)
- Headings

**Changes:**
- Add `ink-markdown` dependency
- In `interaction-stream.tsx`, replace `<Text>{msg.content}</Text>` with `<Markdown>{msg.content}</Markdown>`
- Thinking text remains plain `<Text>` (no markdown in thinking)

## File Changes

| File | Change |
|---|---|
| `src/app/main.ts` | Remove `thread_new` pre-call |
| `src/interface/tui/components/interaction-stream.tsx` | Add thinking display + markdown rendering |
| `src/interface/tui/components/status-bar.tsx` | Complete rewrite with new fields |
| `src/interface/tui/app.tsx` | Pass thinking data + model config to components |
| `src/interface/runtime/remote-kernel.ts` | Forward `stream.thinking_chunk` events |
| `package.json` | Add `ink-markdown` dependency |
