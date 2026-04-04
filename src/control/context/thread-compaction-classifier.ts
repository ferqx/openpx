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
  classifyAnswer(summary: string): CompactionRole[];
  classifyEvent(event: { type: string; summary: string }): CompactionRole[];
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
      if (
        task.status === "blocked"
        || task.status === "completed"
        || task.status === "failed"
      ) {
        return ["RecoveryFact", "NarrativeCandidate"];
      }

      return ["WorkingSetOnly"];
    },

    classifyApproval(approval) {
      return approval.status === "pending" ? ["RecoveryFact"] : ["DropSafe"];
    },

    classifyAnswer(summary) {
      return isBlank(summary) ? ["DropSafe"] : ["RecoveryFact", "NarrativeCandidate"];
    },

    classifyEvent(event) {
      if (isBlank(event.summary)) {
        return ["DropSafe"];
      }

      if (
        event.type === "thread.waiting_approval"
        || event.type === "thread.blocked"
        || event.type === "thread.human_recovery"
      ) {
        return ["RecoveryFact", "NarrativeCandidate"];
      }

      return ["WorkingSetOnly"];
    },

    classifyToolResult(content) {
      if (isBlank(content)) {
        return ["DropSafe"];
      }

      return ["WorkingSetOnly"];
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
