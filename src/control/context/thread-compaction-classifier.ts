import type { ApprovalRequest } from "../../domain/approval";
import type { ControlTask } from "../tasks/task-types";

export type CompactionRole =
  | "RecoveryFact"
  | "NarrativeCandidate"
  | "WorkingSetOnly"
  | "DropSafe";

export interface ThreadCompactionClassifier {
  classifyTask(task: ControlTask): CompactionRole[];
  classifyApproval(approval: ApprovalRequest): CompactionRole[];
  classifyToolResult(content: string): CompactionRole[];
  classifyVerifierFeedback(content: string): CompactionRole[];
  classifyMessage(content: string): CompactionRole[];
  classifyRetrievedMemory(content: string): CompactionRole[];
}

export type ThreadCompactionClassifierOptions = {
  largePayloadThreshold?: number;
};

export function createThreadCompactionClassifier(
  options: ThreadCompactionClassifierOptions = {},
): ThreadCompactionClassifier {
  const largePayloadThreshold = options.largePayloadThreshold ?? 500;

  function isBlank(value: string): boolean {
    return value.trim().length === 0;
  }

  return {
    classifyTask(task) {
      if (task.status === "completed" || task.status === "failed") {
        return ["RecoveryFact", "NarrativeCandidate"];
      }

      if (task.status === "blocked") {
        return ["RecoveryFact"];
      }

      return ["DropSafe"];
    },

    classifyApproval(approval) {
      return approval.status === "pending" ? ["RecoveryFact"] : ["DropSafe"];
    },

    classifyToolResult(content) {
      if (isBlank(content)) {
        return ["DropSafe"];
      }

      return content.length >= largePayloadThreshold ? ["WorkingSetOnly"] : ["NarrativeCandidate"];
    },

    classifyVerifierFeedback(content) {
      return isBlank(content) ? ["DropSafe"] : ["WorkingSetOnly"];
    },

    classifyMessage(content) {
      return isBlank(content) ? ["DropSafe"] : ["WorkingSetOnly"];
    },

    classifyRetrievedMemory(content) {
      return isBlank(content) ? ["DropSafe"] : ["WorkingSetOnly"];
    },
  };
}
