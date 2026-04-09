# OpenWENPX Kernel-First Compaction & Stabilization Plan (V1.3)

Date: 2026-04-05
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This compaction plan is historical and should not be treated as a current implementation baseline.

**Priority:** Kernel Stability (Absolute) > Side-Effect Fidelity > Cloud-Ready Architecture > CLI TUI > Multi-Frontend (Deferred)

## 1. Goal

Implement a "Hardcore" thread compaction and recovery kernel that is **Cloud-Ready**. Ensure 100% fidelity resume while maintaining a compact, serializable state that can eventually be synchronized to a Cloud Agent.

## 2. Kernel-First & Cloud-Ready Principles

1.  **Atomic Recovery:** Compaction must be transactionally linked to the `ExecutionLedger`.
2.  **Location Independence (Cloud-Ready):** 
    - **Relative Paths:** NO absolute paths in `RecoveryFacts` or `NarrativeState`. All paths are relative to `workspaceRoot`.
    - **Serializable State:** All kernel state must be strictly JSON-serializable.
3.  **Revision Monotonicity:** Every state update must increment a versioned `revision` to support future multi-device sync conflict resolution.
4.  **Environmental Fingerprinting:** Use Content Hashes and Git Hashes to verify context consistency across different physical environments.
5.  **Knowledge Promotion:** High-value facts move from Thread to Project Memory during compaction.

---

## 3. Implementation Phases

### Phase 1: Hardened & Cloud-Ready State Schema (Kernel)

Define the "True North" of thread state.

- [ ] **Step 1: Expand `RecoveryFacts` in `src/control/context/thread-compaction-types.ts`**
    - `threadId`, `status`, `revision` (Monotonic Number).
    - `EnvironmentSnapshot`: `gitHead`, `isDirty`, `relativeCwd`, `fileFingerprints` (Map of Path -> Hash).
    - `LedgerState`: Last completed/pending toolCallId.
    - `LatestDurableAnswer`: Structured result of the last successful task.
- [ ] **Step 2: Implement Path Relativizer Service**
    - Ensure all stored facts automatically convert absolute paths to workspace-relative paths.

### Phase 2: Transactional Compaction & Promotion (Kernel)

Implement the logic that ensures "Safe Memory Pruning".

- [ ] **Step 3: Implement `ThreadCompactionClassifier` with Ledger Awareness**
- [ ] **Step 4: Implement `Side-Effect Alignment` (The "Sync" Logic)**
- [ ] **Step 5: Implement `MemoryPromotionService`**
    - Hook into `Boundary Compact` to push high-value facts to `MemoryConsolidator`.

### Phase 3: Root Graph & Stateless Hydration (Kernel)

The "Brain" of the Agent OS.

- [ ] **Step 6: Update `RootStateHydrator` (The "Resume" Test)**
    - **Stateless & Remote-Ready Resume Test:** Simulate a resume on a "New Device" by moving the SQLite file to a different directory, updating the `workspaceRoot`, and verifying the Agent can still function using only relative paths and fingerprints.
- [ ] **Step 7: Integrate `CompactionNode` in `RootGraph`**

### Phase 4: Full CLI TUI Realization (UI)

- [ ] **Step 8: "Answer Pane" & "Ledger View"**
- [ ] **Step 9: High-Fidelity Approval UX**

---

## 4. Verification Benchmarks (Stability & Cloud-Ready)

- [ ] **Benchmark A (Stateless Recovery):** Resume from `RecoveryFacts` + `NarrativeState` without `event_log`.
- [ ] **Benchmark B (Location Independence):**
    - Scenario: Move the project from `/Users/a/project` to `/Users/b/project`.
    - Result: Kernel hydrates correctly because all stored paths are relative.
- [ ] **Benchmark C (Revision Consistency):** 
    - Verify `revision` increments on every compaction/state-change.

---

## 5. Next Steps

1.  **Execute Phase 1:** Formalize the `RecoveryFacts` schema (Relative Paths + Monotonic Revision).
2.  **Execute Phase 2:** Build alignment and promotion logic.
3.  **Strict Halt:** Do NOT touch UI until **Benchmark A & B** are green.
