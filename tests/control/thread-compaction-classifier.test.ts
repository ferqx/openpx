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

    expect(classifier.classifyTask(blockedTask)).toEqual([
      "RecoveryFact",
      "NarrativeCandidate",
    ]);
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

  test("classifies tool output as working-set only", () => {
    const classifier = createThreadCompactionClassifier();
    const longStdout = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n");
    const shortStdout = "ok";

    expect(classifier.classifyToolResult(longStdout)).toEqual(["WorkingSetOnly"]);
    expect(classifier.classifyToolResult(shortStdout)).toEqual(["WorkingSetOnly"]);
  });

  test("classifies nonterminal tasks as working-set only", () => {
    const classifier = createThreadCompactionClassifier();
    const runningTask = createControlTask({
      taskId: "task-3",
      threadId: "thread-1",
      summary: "Streaming repository scan results.",
      status: "running",
    });

    expect(classifier.classifyTask(runningTask)).toEqual(["WorkingSetOnly"]);
  });

  test("classifies answers as recovery facts and narrative candidates", () => {
    const classifier = createThreadCompactionClassifier();

    expect(classifier.classifyAnswer("Runtime snapshot path updated.")).toEqual([
      "RecoveryFact",
      "NarrativeCandidate",
    ]);
  });

  test("classifies events with explicit recovery and working-set paths", () => {
    const classifier = createThreadCompactionClassifier();

    expect(
      classifier.classifyEvent({
        type: "thread.waiting_approval",
        summary: "Waiting on file deletion approval.",
      }),
    ).toEqual(["RecoveryFact", "NarrativeCandidate"]);
    expect(
      classifier.classifyEvent({
        type: "thread.tick",
        summary: "Still running.",
      }),
    ).toEqual(["WorkingSetOnly"]);
  });

  test("classifies empty working-set noise as drop-safe", () => {
    const classifier = createThreadCompactionClassifier();

    expect(classifier.classifyToolResult("   ")).toEqual(["DropSafe"]);
  });
});
