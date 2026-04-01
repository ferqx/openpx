export type MemoryNamespace = "thread" | "durable" | string;

export type MemoryRecord = {
  memoryId: string;
  namespace: MemoryNamespace;
  key: string;
  value: string;
  threadId: string;
  createdAt: string;
};

export function createMemoryRecord(input: {
  memoryId: string;
  namespace: MemoryNamespace;
  key: string;
  value: string;
  threadId: string;
  createdAt?: string;
}): MemoryRecord {
  return {
    memoryId: input.memoryId,
    namespace: input.namespace,
    key: input.key,
    value: input.value,
    threadId: input.threadId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
