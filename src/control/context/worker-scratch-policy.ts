export type ScratchEntry = {
  kind: string;
  content: string;
  timestamp?: number;
};

export interface WorkerScratchPolicy {
  shouldPersist(entry: ScratchEntry): boolean;
}

export function createWorkerScratchPolicy(): WorkerScratchPolicy {
  return {
    shouldPersist(entry: ScratchEntry): boolean {
      // Scratch is non-durable by default.
      // Only "stable_output" is promoted for persistence.
      return entry.kind === "stable_output";
    },
  };
}
