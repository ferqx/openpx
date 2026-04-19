import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";

describe("planner model integration", () => {
  test("routes planner work through the injected model gateway", async () => {
    const modelGateway = {
      async plan(input: { prompt: string }) {
        return {
          summary: `model summary for: ${input.prompt}`,
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const ctx = await createAppContext({
      workspaceRoot: "/tmp/planner-workspace",
      dataDir: ":memory:",
      modelGateway,
    });

    const result = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "plan the repo architecture" },
    });

    expect(result.status).toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const hydrated = await ctx.kernel.hydrateSession();
    expect(hydrated?.status).toBe("completed");
  });

  test("continues into execution when the planner model returns work packages", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "planned startup message work",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_startup_message",
                objective: "Update startup message copy",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal", "file:src/app/main.ts"],
                expectedArtifacts: ["patch:src/app/main.ts"],
              },
            ],
            acceptanceCriteria: ["startup message updated"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["tests/runtime/intake-normalize.test.ts"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-exec";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-exec", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "make startup copy nicer");

    expect(result.status).toBe("completed");
    expect(result.finalResponse).toBe("responded");
    expect(result.executionSummary).toBe("Executed request: Update startup message copy");
  });

  test("normalizes approval-gated delete intent when planner returns only a plain summary", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Delete the scoped file only after explicit approval.",
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-normalized-delete";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-normalized-delete", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "Please delete src/approval-target.ts, but wait for my approval before applying it.",
    );

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]?.toolRequest?.toolName).toBe("apply_patch");
    expect(result.approvals[0]?.toolRequest?.action).toBe("delete_file");
  });

  test("corrects a misclassified respond_only planner package that still encodes an approval-gated delete", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Ask for approval before deleting src/approval-target.ts.",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_delete_intent",
                objective: "Obtain user approval to delete the file src/approval-target.ts.",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["apply_patch"],
                inputRefs: ["thread:goal", "file:src/approval-target.ts"],
                expectedArtifacts: ["patch:src/approval-target.ts"],
              },
            ],
            acceptanceCriteria: ["src/approval-target.ts is removed after approval"],
            riskFlags: [],
            approvalRequiredActions: ["apply_patch.delete_file"],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-misclassified-delete";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-misclassified-delete", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "delete src/approval-target.ts",
    );

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals[0]?.toolRequest?.toolName).toBe("apply_patch");
    expect(result.approvals[0]?.toolRequest?.action).toBe("delete_file");
  });

  test("extracts the real delete path from quoted planner text instead of placeholder patch:file", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Create a work package to delete src/approval-target.ts after user approval.",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_delete_intent",
                objective: "Prepare a patch to delete the file 'src/approval-target.ts' and wait for user approval before applying it.",
                capabilityMarker: "respond_only" as const,
                capabilityFamily: "approval_gated_delete" as const,
                requiresApproval: true,
                allowedTools: ["apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:file"],
              },
            ],
            acceptanceCriteria: ["src/approval-target.ts is removed after approval"],
            riskFlags: [],
            approvalRequiredActions: ["Apply the generated deletion patch."],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-quoted-delete";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-quoted-delete", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "delete src/approval-target.ts");

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals[0]?.toolRequest?.path).toContain("src/approval-target.ts");
    expect(result.approvals[0]?.summary).toContain("src/approval-target.ts");
    expect(result.approvals[0]?.summary).not.toContain(" delete_file file");
  });

  test("normalizes deletion-patch planning text into an approval-gated delete capability", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Review the file and prepare a deletion patch, but do not apply it until approval.",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_delete_patch",
                objective: "Examine src/approval-target.ts to understand its content, then generate a deletion patch. Do NOT apply the patch to the filesystem.",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:file"],
              },
            ],
            acceptanceCriteria: ["src/approval-target.ts is only deleted after approval"],
            riskFlags: [],
            approvalRequiredActions: [
              "Apply the generated deletion patch with apply_patch only after explicit approval.",
            ],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-deletion-patch";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-deletion-patch", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "Clean up src/approval-target.ts, but do not apply the deletion until I approve it.",
    );

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals[0]?.toolRequest?.toolName).toBe("apply_patch");
    expect(result.approvals[0]?.toolRequest?.action).toBe("delete_file");
    expect(result.approvals[0]?.toolRequest?.path).toContain("src/approval-target.ts");
  });

  test("normalizes read-first deletion-preview planning text into an approval-gated delete capability", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Read the file first, then prepare a preview of the deletion before any approval-gated apply step.",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_delete_preview",
                objective: "Read the src/approval-target.ts file to understand its content and generate a summary or patch showing what would be deleted.",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:file"],
              },
            ],
            acceptanceCriteria: ["src/approval-target.ts is only deleted after approval"],
            riskFlags: [],
            approvalRequiredActions: [
              "Apply the generated patch with apply_patch only after the user approves the deletion.",
            ],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-delete-preview";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-delete-preview", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "Clean up src/approval-target.ts, but do not apply the deletion until I approve it.",
    );

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals[0]?.toolRequest?.toolName).toBe("apply_patch");
    expect(result.approvals[0]?.toolRequest?.action).toBe("delete_file");
    expect(result.approvals[0]?.toolRequest?.path).toContain("src/approval-target.ts");
  });

  test("normalizes read-first deletion-preview text even when approvalRequiredActions are underspecified", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Read the target file and describe what a deletion would remove.",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_delete_preview_sparse",
                objective: "Read the src/approval-target.ts file to understand its content and generate a summary or patch showing what would be deleted.",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:file"],
              },
            ],
            acceptanceCriteria: ["src/approval-target.ts is only deleted after approval"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-delete-preview-sparse";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-delete-preview-sparse", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "Clean up src/approval-target.ts, but do not apply the deletion until I approve it.",
    );

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals[0]?.toolRequest?.toolName).toBe("apply_patch");
    expect(result.approvals[0]?.toolRequest?.action).toBe("delete_file");
  });

  test("normalizes cleanup-preview wording into an approval-gated delete capability", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Read the target file and generate a preview of the proposed cleanup (deletions).",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_cleanup_preview",
                objective: "Read the target file to understand its contents and generate a preview of the proposed cleanup (deletions).",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal", "file:src/approval-target.ts"],
                expectedArtifacts: ["patch:file"],
              },
            ],
            acceptanceCriteria: ["src/approval-target.ts is only deleted after approval"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-cleanup-preview";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-cleanup-preview", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "Clean up src/approval-target.ts, but do not apply the deletion until I approve it.",
    );

    expect(result.status).toBe("waiting_approval");
    expect(result.approvals[0]?.toolRequest?.toolName).toBe("apply_patch");
    expect(result.approvals[0]?.toolRequest?.action).toBe("delete_file");
  });
});
