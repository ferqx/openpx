# OpenWENPX Thread Compaction & Kernel Stabilization Plan (V1.1)

**Date:** 2026-04-05
**Priority:** Kernel Stability > Full CLI TUI > Multi-Frontend (Deferred)

## 1. Goal

Implement the structured thread compaction policy (RecoveryFacts, NarrativeState, WorkingSetWindow) to ensure Agent OS kernel stability and deterministic resume/recovery. Fully realize the CLI TUI before starting any client/web work.

## 2. Core Constraints

- **Kernel Stability First:** No multi-frontend work until thread rehydration and compaction are 100% verified.
- **TUI Fidelity:** CLI must be the "gold standard" experience.
- **Durable Recovery:** Threads must be resumable even if historical event logs are pruned.

---

## 3. Implementation Phases

### Phase 1: Structured Thread State Foundation (Kernel)

Define and migrate types to support the three-layer state model.

- [ ] **Step 1: Define Core Types in `src/control/context/thread-compaction-types.ts`**
    - `RecoveryFacts`: Structured facts (threadId, status, blockingReason, pendingApprovals, latestDurableAnswer).
    - `NarrativeState`: Compacted text summaries (threadSummary, taskSummaries).
    - `WorkingSetWindow`: Recent messages/tool outputs.
- [ ] **Step 2: Update Persistence Layer**
    - Ensure `sqlite-thread-store.ts` can persist/retrieve these structured blobs.
    - Version the thread state to handle future migration.

### Phase 2: Compaction Logic Implementation (Kernel)

Implement the "Classifier -> Projector -> Policy" pipeline.

- [ ] **Step 3: Implement `ThreadCompactionClassifier`**
    - Classify inputs into `RecoveryFact`, `NarrativeCandidate`, `WorkingSetOnly`, or `DropSafe`.
- [ ] **Step 4: Implement `ThreadStateProjector`**
    - Project classified items into the three layers.
    - Evolve `thread-narrative-service.ts` to be a consumer of this projection.
- [ ] **Step 5: Implement `ThreadCompactionPolicy`**
    - Trigger "Soft", "Boundary", and "Hard" compaction based on token usage and task lifecycle changes.

### Phase 3: Root Graph & Hydration Integration (Kernel)

Wire the compaction logic into the LangGraph execution loop.

- [ ] **Step 6: Update `RootGraph` (src/runtime/graph/root/graph.ts)**
    - Add explicit `compact` node before finishing or waiting for approval.
    - Ensure `post_turn_guard` calls the policy.
- [ ] **Step 7: Implement `RootStateHydrator`**
    - Build the `RootState` for LangGraph using only the compacted view (RecoveryFacts + Narrative + WorkingSet).
    - Verify that a thread can resume from `blocked` or `waiting_approval` using this hydrated state.

### Phase 4: Full CLI TUI Realization (UI)

Upgrade the TUI to leverage the new structured kernel state for higher fidelity.

- [ ] **Step 8: "Answer Pane" Fidelity**
    - Update `answer-pane.tsx` to render `latestDurableAnswer` from `RecoveryFacts`.
    - Show diffs and verification results directly from structured facts.
- [ ] **Step 9: "Status Bar" & "Event Stream" Polish**
    - Use `WorkingSetWindow` to show "Thinking" context.
    - Use `NarrativeState` to show historical thread context in a collapsed, searchable view.
- [ ] **Step 10: Robust Approval UX**
    - Ensure the approval panel in TUI is driven by structured `pendingApprovals` from `RecoveryFacts`, making it resilient to reconnects.

---

## 4. Verification Checklist (Kernel Stability)

- [ ] **Recovery Test:** Manually kill the runtime during a "blocked" task, restart, and confirm it resumes exactly where it left off using `RecoveryFacts`.
- [ ] **Pruning Test:** Artificially prune the `event_log` for a thread and verify the runtime can still answer questions about past tasks using `NarrativeState`.
- [ ] **Token Pressure Test:** Simulate a 100-message thread and verify that `Hard Compact` triggers and reduces the `WorkingSetWindow` correctly.

---

## 5. Next Steps

1. Execute **Phase 1** (Types & Schema).
2. Execute **Phase 2** (Core Logic).
3. **STOP:** Run full integration tests before proceeding to TUI (Phase 4).
4. No multi-frontend work (VSCode/Web) is scheduled in this plan.
