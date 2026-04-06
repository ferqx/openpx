# OpenWENPX Kernel-First Compaction & Stabilization Plan (V1.2)

**Date:** 2026-04-05
**Priority:** Kernel Stability (Absolute) > Side-Effect Fidelity > CLI TUI > Multi-Frontend (Deferred)

## 1. Goal

Implement a "Hardcore" thread compaction and recovery kernel. Ensure that the Agent OS can resume with 100% fidelity after crashes or long interruptions by synchronizing structured facts, side-effect ledgers, and environmental snapshots.

## 2. Kernel-First Principles

1.  **Atomic Recovery:** Compaction must be transactionally linked to the `ExecutionLedger`.
2.  **Environmental Context:** `RecoveryFacts` must include the physical state of the workspace (Git, CWD).
3.  **Knowledge Promotion:** Compaction is a "Filter", not just a "Delete". High-value facts move from Thread to Project Memory.
4.  **No UI Bloat:** TUI work only proceeds once the Kernel passes the "Stateless Resume" test.

---

## 3. Implementation Phases

### Phase 1: Hardened State Schema (Kernel)

Define the "True North" of thread state.

- [ ] **Step 1: Expand `RecoveryFacts` in `src/control/context/thread-compaction-types.ts`**
    - `threadId`, `status`, `revision`.
    - `EnvironmentSnapshot`: `gitHead`, `isDirty`, `cwd`, `fileFingerprints[]`.
    - `LedgerState`: Last completed/pending toolCallId from `ExecutionLedger`.
    - `LatestDurableAnswer`: Structured result of the last successful task.
- [ ] **Step 2: Define `PromotionPolicy`**
    - Logic to identify "Consolidatable Facts" (e.g., discovered bugs, architectural decisions) before they are purged from the narrative.

### Phase 2: Transactional Compaction Logic (Kernel)

Implement the logic that ensures "Safe Memory Pruning".

- [ ] **Step 3: Implement `ThreadCompactionClassifier` with Ledger Awareness**
    - Must verify if a tool output is "safe to summarize" based on its completion status in the `ExecutionLedger`.
- [ ] **Step 4: Implement `Side-Effect Alignment` (The "Sync" Logic)**
    - Before updating `RecoveryFacts`, verify that the physical disk state matches the ledger's "Completed" state.
- [ ] **Step 5: Implement `MemoryPromotionService`**
    - Hook into `Boundary Compact` to push high-value facts to `MemoryConsolidator`.
    - Ensure "Thread-to-Project" knowledge transfer is verified.

### Phase 3: Root Graph & Stateless Hydration (Kernel)

The "Brain" of the Agent OS.

- [ ] **Step 6: Update `RootStateHydrator` (The "Resume" Test)**
    - **Stateless Resume Test:** Build a test where the `event_log` is deleted, but the Agent resumes correctly using ONLY `RecoveryFacts`, `NarrativeState`, and `EnvironmentSnapshot`.
    - Handle Git Hash mismatches (e.g., user changed branch while Agent was blocked).
- [ ] **Step 7: Integrate `CompactionNode` in `RootGraph`**
    - Explicit turn-based compaction triggers: `Soft` (on message limit), `Boundary` (on task completion/block).

### Phase 4: CLI TUI Realization (UI)

Render the "Truth" from the Kernel.

- [ ] **Step 8: "Answer Pane" & "Ledger View"**
    - Render the `LatestDurableAnswer`.
    - (Debug Mode) Show the current physical context (Git Hash, Dirty files) to the user.
- [ ] **Step 9: High-Fidelity Approval UX**
    - Approvals are now persistent and linked to specific `RecoveryFacts`, surviving client restarts.

---

## 4. Verification Benchmarks (Must Pass for "Stability")

- [ ] **Benchmark A (Stateless Recovery):** 
    - Scenario: Task blocks on approval -> Runtime Process Kill -> Delete Event Log -> Restart.
    - Result: Agent must show the same approval prompt and know the exact Git state it's working on.
- [ ] **Benchmark B (Idempotency Check):**
    - Scenario: Crash during `apply_patch` -> Restart.
    - Result: `ExecutionLedger` prevents re-applying the same patch twice if it already succeeded physically.
- [ ] **Benchmark C (Knowledge Retention):**
    - Scenario: 50 turns of "Trial and Error" -> Hard Compaction.
    - Result: The "Reason why it failed" is promoted to Project Memory; the 49 failed attempts' raw tool output are purged.

---

## 5. Next Steps

1.  **Execute Phase 1:** Formalize the `RecoveryFacts` schema with Git and Ledger fields.
2.  **Execute Phase 2:** Build the alignment and promotion logic.
3.  **Strict Halt:** Do NOT touch UI until **Benchmark A** is green.
