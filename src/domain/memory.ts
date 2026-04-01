import { memoryId as sharedMemoryId, threadId as sharedThreadId } from "../shared/ids";
import { memoryNamespaceSchema } from "../shared/schemas";
import { z } from "zod";

export type MemoryNamespace = z.infer<typeof memoryNamespaceSchema>;

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
