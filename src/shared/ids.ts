/** 
 * @module shared/ids
 * 类型安全 ID 工厂模块。
 * 
 * 为各类领域实体提供类型安全的标识符创建和校验函数。
 * 每个工厂函数接受可选的已有 ID（用于回填），未提供时自动生成新的 ULID。
 * 
 * 术语对照：threadId=协作线标识，runId=执行尝试标识，
 * taskId=具体步骤标识，agentRunId=运行实例标识，
 * eventId=事件标识，approvalRequestId=审批请求标识，
 * memoryId=记忆标识，toolCallId=工具调用标识
 */
import { ulid } from "ulid";
import { domainError } from "./errors";

/** 类型别名，所有 ID 在运行时都是 string，但通过工厂函数获得类型安全 */
export type Id = string;

/** 校验 ID 非空，空值时抛出 DomainError */
export function ensureId(value: string): Id {
  if (!value) {
    throw domainError("id must not be empty");
  }

  return value;
}

/** 生成新的 ULID 标识符 */
export function nextId(): Id {
  return ulid();
}

/** 协作线标识工厂——提供已有值时校验，否则生成新 ID */
export function threadId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 执行尝试标识工厂 */
export function runId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 具体步骤标识工厂 */
export function taskId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 运行实例标识工厂 */
export function agentRunId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 事件标识工厂 */
export function eventId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 审批请求标识工厂 */
export function approvalRequestId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 记忆标识工厂 */
export function memoryId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

/** 工具调用标识工厂 */
export function toolCallId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}
