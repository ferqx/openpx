# Agent OS Reset Migration Notes

Date: 2026-04-06
Status: Core reset implemented

## Freeze Rules

- No new TUI-owned business state
- No new protocol `z.any()` for core runtime objects
- No `any` or `as any` in reset implementation work
- No new natural-language resume semantics for approvals or control actions
- No new architecture changes driven solely by shell optimization documents

## Active Design Authority

The active top-level design documents are:

- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Superseded As Active Drivers

The following remain useful for history, but are no longer active implementation baselines:

- `docs/superpowers/plans/2026-04-01-langgraph-bun-agent-os-v1.md`
- `docs/superpowers/specs/2026-04-05-tui-optimization-design.md`
- `docs/superpowers/specs/2026-04-05-tui-minimalist-refactor-design.md`
- thread-compaction plan/spec variants as primary architecture drivers

## Resolved During Execution

- `WorkerView` now includes stable identity and lifecycle fields: `workerId`, `threadId`, `taskId`, `role`, `status`, `spawnReason`, `startedAt`, `endedAt`, and `resumeToken`.
- Runtime control semantics now use explicit approval resolution commands instead of natural-language resume inputs.
- Stable runtime snapshots now carry typed `threads`, `tasks`, `pendingApprovals`, `answers`, and `workers`, with TUI consumption routed through `RuntimeSessionState`.
- Narrative and compaction remain available, but no longer redefine core thread/task/approval/worker lifecycle truth.
- Event layering is now explicit:
  - durable events are the persisted recovery/narrative whitelist
  - kernel events are in-process coordination signals
  - runtime events are the stable external protocol
- `stream.*` remains runtime-only and does not belong in durable storage.
- TUI hydration and command-result refresh now use `session.updated`, not `thread.view_updated`.
- The TUI kernel contract now returns a single typed session result for both `handleCommand()` and `hydrateSession()`.
- The TUI no longer keeps a local event buffer as a second interpretation pass; event handling is direct and presentation-scoped.
- Protocol versioning is now explicit:
  - supported protocol versions are modeled in one protocol module
  - snapshot and runtime event schemas accept only supported versions
  - runtime HTTP requests may negotiate protocol version explicitly
  - unsupported versions are rejected instead of silently accepted

## Remaining Follow-Up

- Review event naming for a future multi-version protocol pass if external clients beyond the built-in TUI are added.
- Tighten smoke and model-connectivity diagnostics so successful smoke runs emit more than a bare summary when needed.

## Tail Convergence Status

Completed tail tasks:

- Task 1: TUI hydration/session refresh no longer overloads `thread.view_updated`
- Task 2: the broad `isKernelResult(...)` UI flow is gone
- Task 3: the TUI event-buffer pass-through has been removed and local state is further reduced
- Task 4: durable/kernel/runtime event layering rules are now written into the active design docs
- Task 5: focused interface/runtime checks, full typecheck, and full test suite all pass

Current verification snapshot:

- `bun test tests/interface tests/runtime/kernel-tui-sync.test.ts tests/runtime/runtime-protocol-schema.test.ts` passes
- `bun run typecheck` passes
- `bun test` passes

Conclusion:

- the `thread.view_updated` ambiguity is gone for TUI hydration
- the remaining TUI-owned state is presentation-oriented rather than a competing business-truth store
- tail convergence is functionally complete, with only future multi-version protocol expansion intentionally deferred

## Finalization Checklist

- [x] Stable protocol modules replace broad snapshot schema ownership
- [x] Kernel no longer depends on implicit hydration timing after background start
- [x] Approval resume is explicit
- [x] Worker lifecycle is visible in snapshot and event streams
- [x] TUI local state is reduced to presentational concerns
- [x] Durable, kernel, and runtime event layers are explicitly documented and aligned with code
- [x] Current architecture doc updated to point to the reset design
- [x] Tail convergence verification passed with focused checks, full typecheck, and full test suite
