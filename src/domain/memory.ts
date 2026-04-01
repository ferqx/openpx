import { memoryId as sharedMemoryId, threadId as sharedThreadId } from "../shared/ids";
import { memoryNamespaceSchema } from "../shared/schemas";

export type MemoryNamespace = typeof memoryNamespaceSchema._type;

export type MemoryRecord = {
  memoryId: ReturnType<typeof sharedMemoryId>;
  namespace: MemoryNamespace;
  key: string;
  value: string;
  threadId: ReturnType<typeof sharedThreadId>;
  createdAt?: string;
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
    memoryId: sharedMemoryId(input.memoryId),
    namespace: input.namespace,
    key: input.key,
    value: input.value,
    threadId: sharedThreadId(input.threadId),
    createdAt: input.createdAt,
  };
}
