import { describe, expect, test } from "bun:test";
import { createModelGateway } from "../../src/infra/model-gateway";
import { createThreadStateProjector } from "../../src/control/context/thread-state-projector";
import { compactThreadView } from "../../src/control/context/thread-compaction-policy";
import { hydrateRootState } from "../../src/control/context/root-state-hydrator";
import { nextId } from "../../src/shared/ids";
import type { DerivedThreadView } from "../../src/control/context/thread-compaction-types";

/**
 * KERNEL FIDELITY BENCHMARK
 * This test uses the real model to verify if the compaction strategy 
 * preserves "Strategic Intent" over long durations.
 */
describe("Kernel Fidelity Benchmark (Real Model)", () => {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const modelName = process.env.OPENAI_MODEL || "gpt-4-turbo";
  const runRealModelTests = process.env.OPENPX_RUN_REAL_MODEL_TESTS === "1";

  if (!runRealModelTests || !apiKey) {
    console.warn(
      "Skipping fidelity test: set OPENPX_RUN_REAL_MODEL_TESTS=1 and OPENAI_API_KEY to enable real-model benchmarks.",
    );
    return;
  }

  console.log(`[DEBUG] Initializing ModelGateway with model: ${modelName} at ${baseURL}`);
  
  const gateway = createModelGateway({ apiKey, baseURL, modelName });
  const projector = createThreadStateProjector();

  test("preserves architectural constraints after multiple hard compactions", async () => {
    const threadId = nextId();
    let view: DerivedThreadView = {
      recoveryFacts: {
        threadId,
        revision: 1,
        schemaVersion: 1,
        status: "active",
        updatedAt: new Date().toISOString(),
        pendingApprovals: [],
      },
    };

    // --- PHASE 1: INITIAL INSTRUCTION ---
    // We give the agent a very specific constraint that must survive compaction.
    const initialInstruction = "Project Rule: ALL filenames must start with 'px-'. No exceptions.";
    view = projector.project(view, { kind: "message", content: initialInstruction });
    view = projector.project(view, { 
      kind: "task", 
      task: { 
        taskId: "task-0", 
        threadId, 
        runId: "run-0",
        summary: "Initialize project with px- prefix constraint", 
        status: "completed" 
      } 
    });

    // --- PHASE 2: LONG CHATTER (Simulating 15 turns of noise) ---
    for (let i = 1; i <= 15; i++) {
      view = projector.project(view, { kind: "message", content: `Step ${i}: Reading file ${i}... Processing metadata...` });
      view = projector.project(view, { kind: "tool_result", content: `File content for data-${i}.txt: dummy content` });
      
      // Trigger HARD COMPACTION every 5 turns to wipe raw history
      if (i % 5 === 0) {
        view = compactThreadView(view, { trigger: "hard" });
      }
    }

    // --- PHASE 3: THE FIDELITY CHECK ---
    // Now we ask the model to perform a task. It should still remember the 'px-' constraint.
    const currentState = hydrateRootState(view, { workspaceRoot: "/tmp", currentCwd: "/tmp" });
    
    // We use the 'plan' role to see if it respects the constraint
    const finalPrompt = `
    Based on the current thread context, create a file to store user profiles.
    What filename should you use?
    
    Context messages:
    ${currentState.messages.join("\n")}
    `;

    const result = await gateway.plan({ prompt: finalPrompt });
    
    console.log(`[FIDELITY RESULT] Final Summary: ${result.summary}`);
    
    // ASSERTION: The summary should mention a filename starting with 'px-'
    // Note: Model outputs vary, but a high-fidelity system ensures the constraint survives.
    expect(result.summary.toLowerCase()).toContain("px-");
  }, 60000); // 60s timeout for real model response
});
