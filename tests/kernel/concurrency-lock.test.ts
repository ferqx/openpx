import { describe, expect, test } from "bun:test";
import { createThreadStateProjector } from "../../src/control/context/thread-state-projector";
import { nextId } from "../../src/shared/ids";

describe("Kernel Revision Lock (Concurrency)", () => {
  test("prevents out-of-order state updates using monotonic revisions", async () => {
    const projector = createThreadStateProjector();
    const threadId = nextId();
    
    // 1. Initial State (Rev 1)
    let baseView = {
      recoveryFacts: {
        threadId,
        revision: 1,
        schemaVersion: 1,
        status: "active",
        updatedAt: new Date().toISOString(),
        pendingApprovals: [],
      },
    };

    // 2. Client A and Client B both see Rev 1
    // Client A projects a task
    const viewA = projector.project(baseView, {
      kind: "task",
      task: { taskId: "A", threadId, summary: "Task A", status: "completed" }
    });
    
    // Client B projects a different task
    const viewB = projector.project(baseView, {
      kind: "task",
      task: { taskId: "B", threadId, summary: "Task B", status: "completed" }
    });

    // Both should now be at revision 2 relative to Rev 1
    expect(viewA.recoveryFacts!.revision).toBe(2);
    expect(viewB.recoveryFacts!.revision).toBe(2);

    // 3. ATOMIC PERSISTENCE SIMULATION
    // In our storage layer, saving should follow: IF currentRev == storedRev THEN update
    const mockStorage = {
      currentRev: 1,
      async save(view: any) {
        if (view.recoveryFacts.revision !== this.currentRev + 1) {
          throw new Error("REVISION_CONFLICT: Someone else updated the thread.");
        }
        this.currentRev = view.recoveryFacts.revision;
      }
    };

    // First save (A) succeeds
    await mockStorage.save(viewA);
    expect(mockStorage.currentRev).toBe(2);

    // Second save (B) MUST fail because storage is now at 2, and B's target revision is 2 (from 1)
    // Actually, B would try to save its Rev 2 over Rev 2. 
    // Wait, the standard optimistic lock check is: update ... set revision = N+1 where revision = N
    
    const saveAttemptB = mockStorage.save(viewB);
    expect(saveAttemptB).rejects.toThrow("REVISION_CONFLICT");
  });
});
