import { describe, expect, test } from "bun:test";
import { createThreadCompactionClassifier } from "../../src/control/context/thread-compaction-classifier";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createApprovalRequest } from "../../src/domain/approval";

describe("ThreadCompactionClassifier", () => {
  test("classifies blocked tasks and pending approvals as recovery facts", () => {
    const classifier = createThreadCompactionClassifier();
    const blockedTask = createControlTask({
      taskId: "task-1",
      threadId: "thread-1",
      summary: "Waiting for manual database recovery.",
      status: "blocked",
    });
    const pendingApproval = createApprovalRequest({
      approvalRequestId: "approval-1",
      threadId: "thread-1",
      taskId: "task-2",
      toolCallId: "tool-call-1",
      toolRequest: {
        toolCallId: "tool-call-1",
        threadId: "thread-1",
        taskId: "task-2",
        toolName: "delete_file",
        args: { path: "tmp/output.txt" },
      },
      summary: "Delete tmp/output.txt",
      risk: "high",
    });

    expect(classifier.classifyTask(blockedTask)).toContain("RecoveryFact");
    expect(classifier.classifyApproval(pendingApproval)).toContain("RecoveryFact");
  });

  test("classifies completed tasks as both recovery facts and narrative candidates", () => {
    const classifier = createThreadCompactionClassifier();
    const completedTask = createControlTask({
      taskId: "task-2",
      threadId: "thread-1",
      summary: "Executor patched the runtime snapshot path.",
      status: "completed",
    });

    expect(classifier.classifyTask(completedTask)).toEqual([
      "RecoveryFact",
      "NarrativeCandidate",
    ]);
  });

  test("classifies large tool output as working-set only", () => {
    const classifier = createThreadCompactionClassifier();
    const longStdout = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n");

    expect(classifier.classifyToolResult(longStdout)).toEqual(["WorkingSetOnly"]);
  });

  test("classifies empty working-set noise as drop-safe", () => {
    const classifier = createThreadCompactionClassifier();

    expect(classifier.classifyToolResult("   ")).toEqual(["DropSafe"]);
  });
});
