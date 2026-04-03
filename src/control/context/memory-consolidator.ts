import type { MemoryStorePort } from "../../persistence/ports/memory-store-port";
import type { ModelGateway } from "../../infra/model-gateway";
import type { ThreadNarrative } from "./thread-narrative-service";
import { createMemoryRecord } from "../../domain/memory";

export class MemoryConsolidator {
  constructor(
    private memoryStore: MemoryStorePort,
    private modelGateway: ModelGateway
  ) {}

  async consolidate(threadId: string, narrative: ThreadNarrative): Promise<void> {
    if (narrative.events.length === 0) return;

    // Use model to extract key decisions and project facts from narrative
    const prompt = `Review the following thread narrative and extract 1-3 key project facts or architectural decisions.
    Return them as a concise JSON list of strings.
    
    Narrative:
    ${narrative.summary}
    
    Events:
    ${narrative.events.map(e => `- ${e.summary}`).join("\n")}
    `;

    // We reuse the 'plan' role for extraction or could add an 'extract' method to ModelGateway
    const result = await this.modelGateway.plan({ prompt });
    
    // For now, we'll store the whole summary as a single project memory entry
    // In a more advanced version, we'd parse the model output into individual records
    const fact = result.summary;
    
    await this.memoryStore.save(createMemoryRecord({
      memoryId: `mem_${Date.now()}_${threadId}`,
      namespace: "project",
      key: `thread_summary_${threadId}`,
      value: fact,
      threadId: threadId,
      createdAt: new Date().toISOString(),
    }));
  }
}
