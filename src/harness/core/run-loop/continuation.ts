import type { ContinuationKind, LoopStep } from "./step-types";

/** continuation envelope：暂停后继续执行的结构化信封。 */
export type ContinuationEnvelope = {
  continuationId: string;
  kind: ContinuationKind;
  decision?: "approved" | "rejected";
  approvalRequestId?: string;
  reason?: string;
  step?: LoopStep;
  input?: string;
};

/** 生成 continuation id，默认优先使用 crypto.randomUUID。 */
export function createContinuationId(): string {
  return `continuation_${crypto.randomUUID()}`;
}
