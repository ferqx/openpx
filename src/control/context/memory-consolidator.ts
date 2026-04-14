/** 
 * @module control/context/memory-consolidator
 * 记忆整合器（memory consolidator）。
 * 
 * 从协作线叙事摘要中提取关键项目事实和架构决策，
 * 以项目级记忆的形式持久化存储，供后续协作线复用。
 * 
 * 术语对照：memory=记忆，consolidator=整合器，narrative=叙事
 */
import type { MemoryStorePort } from "../../persistence/ports/memory-store-port";
import type { ModelGateway } from "../../infra/model-gateway";
import type { ThreadNarrative } from "./thread-narrative-service";
import { createMemoryRecord } from "../../domain/memory";

/** 记忆整合器——从叙事中提取关键事实并持久化 */
export class MemoryConsolidator {
  constructor(
    private memoryStore: MemoryStorePort,
    private modelGateway: ModelGateway
  ) {}

  /** 整合指定协作线的叙事，提取关键事实并存储为项目级记忆 */
  async consolidate(threadId: string, narrative: ThreadNarrative): Promise<void> {
    if (narrative.events.length === 0) return;  // 无事件时跳过

    // 当前版本采取“先用模型粗提炼，再整段存成一条 project memory”的保守策略。
    // 这样即使抽取质量一般，也不会破坏已有 thread narrative 结构。
    const prompt = `Review the following thread narrative and extract 1-3 key project facts or architectural decisions.
    Return them as a concise JSON list of strings.
    
    Narrative:
    ${narrative.summary}
    
    Events:
    ${narrative.events.map(e => `- ${e.summary}`).join("\n")}
    `;

    // 复用 plan 角色进行提取；后续若引入专用 extract API，这里应优先切换过去。
    const result = await this.modelGateway.plan({ prompt });
    
    // 目前将模型返回摘要作为单条项目级记忆。
    // 更细粒度的结构化 memory 仍可在后续版本里演进。
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
