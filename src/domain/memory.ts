/**
 * @module domain/memory
 * 记忆（memory）领域实体。
 *
 * MemoryRecord 表示 thread 内的一条持久化记忆条目，用于在跨 run 的
 * 协作过程中保存和检索关键上下文信息。每条记忆归属于一个 namespace
 * （命名空间）和一个 key（键），实现结构化的记忆存储与查询。
 *
 * namespace（命名空间）用于对记忆进行分类，例如 instruction（指令记忆）、
 * fact（事实记忆）、preference（偏好记忆）等。
 */
import { memoryId as sharedMemoryId, threadId as sharedThreadId } from "../shared/ids";
import { memoryNamespaceSchema } from "../shared/schemas";
import { z } from "zod";

/** 记忆命名空间类型——从 schema 推导，用于对记忆条目进行分类 */
export type MemoryNamespace = z.infer<typeof memoryNamespaceSchema>;

/**
 * 记忆记录——thread 内的持久化记忆条目。
 * 通过 namespace + key 实现结构化的记忆存储与检索，
 * 确保跨 run 的上下文信息可持续访问。
 */
export type MemoryRecord = {
  /** memoryId——记忆条目唯一标识 */
  memoryId: ReturnType<typeof sharedMemoryId>;
  /** namespace——命名空间，对记忆进行分类（如 instruction、fact、preference） */
  namespace: MemoryNamespace;
  /** key——记忆键，在 namespace 内唯一标识一条记忆 */
  key: string;
  /** value——记忆值，存储实际的上下文内容 */
  value: string;
  /** threadId——所属协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** createdAt——创建时间（ISO 8601） */
  createdAt?: string;
};

/**
 * 创建记忆记录工厂函数。
 * 对 ID 字段施加品牌类型包装，确保类型安全。
 */
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
