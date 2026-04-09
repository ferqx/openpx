# OpenWENPX Kernel-First Compaction & Stabilization Plan (V1.4)

Date: 2026-04-05
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This compaction plan is historical and should not be treated as a current implementation baseline.

**Priority:** Kernel Stability (Absolute) > Data Sync Readiness (Forward-Compatible) > Side-Effect Fidelity > CLI TUI

## 1. Goal

Implement a "Hardcore" thread compaction kernel with **Forward-Compatible** session storage. Ensure that session history is structured to support future cloud synchronization and prevent data loss during version iterations.

## 2. Sync-Ready & Kernel-First Principles

1.  **Global Identity (Cloud-Ready):** Use ULIDs/UUIDs for all entities (Thread, Task, Event) to prevent ID collisions in future shared/cloud databases.
2.  **Schema Versioning:** Every record (Thread, Task, Memory) must include a `schemaVersion`.
3.  **Strict Serialization:** `RecoveryFacts` and `NarrativeState` must be 100% JSON-serializable with NO local-specific pointers.
4.  **Temporal Consistency:** Use ISO8601 UTC timestamps for all historical records.
5.  **Atomic Compaction:** Compaction must be transactionally linked to the `ExecutionLedger`.
6.  **Knowledge Promotion:** High-value facts move from Thread to Project Memory to ensure long-term value retention.

---

## 3. Implementation Phases

### Phase 1: Forward-Compatible State Schema (Kernel)

Define the "True North" of thread state with sync-readiness in mind.

- [ ] **Step 1: Expand `RecoveryFacts` in `src/control/context/thread-compaction-types.ts`**
    - `threadId` (ULID/UUID), `status`, `revision`, `schemaVersion`.
    - `EnvironmentContext`: Store workspace-relative paths only.
    - `LatestDurableAnswer`: Structured result summary for future UI re-rendering.
- [ ] **Step 2: Update ID Generation Logic**
    - Ensure `src/shared/ids.ts` uses ULIDs for all persistence-related IDs.
- [ ] **Step 3: Standardize Timestamps**
    - Audit all models to ensure UTC ISO8601 strings are used instead of local Date objects.

### Phase 2: Transactional Compaction & Promotion (Kernel)

Implement the logic that ensures "Safe Memory Pruning" and data integrity.

- [ ] **Step 4: Implement `ThreadCompactionClassifier`**
    - Differentiate between "Ephemeral Tool Logs" and "Durable Session History".
- [ ] **Step 5: Implement `MemoryPromotionService`**
    - Ensure high-value findings are promoted to `MemoryStore` with full sync-ready metadata.

### Phase 3: Root Graph & Stateless Hydration (Kernel)

- [ ] **Step 6: Update `RootStateHydrator` (The "Resume" Test)**
    - **Stateless Resume Test:** Verify the Agent can resume using ONLY the structured `RecoveryFacts` and `NarrativeState` (simulating a cloud-fetched state).
- [ ] **Step 7: Integrate `CompactionNode` in `RootGraph`**

### Phase 4: Full CLI TUI Realization (UI)

- [ ] **Step 8: "Answer Pane" & "History View"**
    - Render historical summaries from `NarrativeState` correctly.
- [ ] **Step 9: High-Fidelity Approval UX**

---

## 4. Verification Benchmarks (Stability & Sync-Ready)

- [ ] **Benchmark A (Stateless Recovery):** Resume correctly without `event_log` using only JSON-serialized facts.
- [ ] **Benchmark B (ID Uniqueness):** Verify all IDs generated are ULIDs, ensuring no conflicts when merging local DBs.
- [ ] **Benchmark C (Schema Resilience):** Verify that the system can load a record with an older `schemaVersion` (via a simple mock migration).

---

## 5. Next Steps

1.  **Execute Phase 1:** Formalize the `RecoveryFacts` schema (ULIDs, SchemaVersion, UTC).
2.  **Execute Phase 2:** Build alignment and promotion logic.
3.  **Strict Halt:** Do NOT touch UI until **Benchmark A** is green.
