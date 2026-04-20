export type ScratchEntry = {
  kind: string;
  content: string;
  timestamp?: number;
};

export interface AgentRunScratchPolicy {
  shouldPersist(entry: ScratchEntry): boolean;
}

export function createAgentRunScratchPolicy(): AgentRunScratchPolicy {
  return {
    shouldPersist(entry: ScratchEntry): boolean {
      // scratch 默认不持久化；
      // 只有 stable_output 才会被提升为可恢复真相。
      return entry.kind === "stable_output";
    },
  };
}
