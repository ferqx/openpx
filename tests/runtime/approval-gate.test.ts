import { describe, expect, test } from "bun:test";
import { Annotation, END, INTERRUPT, MemorySaver, START, StateGraph, isInterrupted } from "@langchain/langgraph";
import { approvalGateNode } from "../../src/runtime/graph/root/nodes/approval-gate";
import type { RootMode, RootRoute } from "../../src/runtime/graph/root/context";
import type { ResumeControl } from "../../src/runtime/graph/root/resume-control";

describe("approval gate node", () => {
  test("interrupts when a pending approval must be resolved", async () => {
    const GateState = Annotation.Root({
      input: Annotation<string | undefined>(),
      mode: Annotation<RootMode>(),
      approved: Annotation<boolean | undefined>(),
      currentWorkPackageId: Annotation<string | undefined>(),
      pendingApproval: Annotation<{ summary: string } | undefined>(),
      resumeValue: Annotation<string | ResumeControl | undefined>(),
      route: Annotation<RootRoute | undefined>(),
    });
    const graph = new StateGraph(GateState)
      .addNode("approval-gate", approvalGateNode)
      .addEdge(START, "approval-gate")
      .addEdge("approval-gate", END)
      .compile({ checkpointer: new MemorySaver() });

    const result = await graph.invoke({
      mode: "waiting_approval",
      pendingApproval: {
        summary: "delete src/old.ts",
      },
    }, { configurable: { thread_id: "thread_approval_gate" } });

    expect(isInterrupted(result)).toBe(true);
    if (!isInterrupted(result)) {
      throw new Error("expected approval gate interrupt");
    }

    expect(result[INTERRUPT][0]?.value).toEqual({
      kind: "approval",
      mode: "waiting_approval",
      summary: "delete src/old.ts",
    });
  });

  test("routes approved resumes back into execution", () => {
    const result = approvalGateNode({
      mode: "waiting_approval",
      pendingApproval: {
        summary: "delete src/old.ts",
      },
      resumeValue: {
        kind: "approval_resolution",
        decision: "approved",
        approvalRequestId: "approval-delete",
      },
      currentWorkPackageId: "pkg_delete",
    });

    expect(result).toEqual({
      approved: true,
      currentWorkPackageId: "pkg_delete",
      mode: "execute",
      pendingApproval: undefined,
      route: "executor",
      resumeValue: undefined,
    });
  });

  test("routes rejected resumes back into planning with the rejection reason", () => {
    const result = approvalGateNode({
      input: "delete src/old.ts",
      mode: "waiting_approval",
      pendingApproval: {
        summary: "delete src/old.ts",
      },
      resumeValue: {
        kind: "approval_resolution",
        decision: "rejected",
        reason: "do not delete production files",
      },
    });

    expect(result).toEqual({
      approved: false,
      input: "do not delete production files",
      mode: "plan",
      pendingApproval: undefined,
      route: "planner",
      resumeValue: undefined,
    });
  });
});
