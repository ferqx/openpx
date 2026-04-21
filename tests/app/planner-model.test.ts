import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";

describe("planner model integration", () => {
  async function noExecutorToolCalls() {
    return {
      summary: "no executor tool calls",
      toolCalls: [],
    };
  }

  test("routes planner work through the injected model gateway", async () => {
    const modelGateway = {
      async plan(input: { prompt: string }) {
        return {
          summary: `model summary for: ${input.prompt}`,
        };
      },
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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

  test("continues after planning when the thread is in plan mode", async () => {
    let verifyCalls = 0;
    let respondCalls = 0;
    const modelGateway = {
      async plan() {
        return {
          summary: "先梳理 runtime truth，再拆协议投影，最后补 UI 显示。",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_truth",
                objective: "梳理 thread truth 与持久化字段",
                capabilityMarker: "respond_only" as const,
                allowedTools: ["read_file"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["summary:pkg_truth"],
              },
            ],
            acceptanceCriteria: ["threadMode 可持久化且默认 normal"],
            riskFlags: ["避免把 /plan 继续当作文本前缀 hack"],
            approvalRequiredActions: [],
            verificationScope: ["tests/runtime/runtime-snapshot.test.ts"],
          },
        };
      },
      execute: noExecutorToolCalls,
      async verify() {
        verifyCalls += 1;
        return { summary: "verified", isValid: true };
      },
      async respond() {
        respondCalls += 1;
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-plan-mode";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = {
      ...createThread("thread-plan-mode", workspaceRoot, ctx.config.projectId),
      threadMode: "plan" as const,
    };
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "把 agent/mode 语义拆清楚");

    expect(result.status).toBe("completed");
    expect(result.finalResponse).toBe("responded");
    expect(result.executionSummary).toBe("Executed request: 梳理 thread truth 与持久化字段");
    expect(verifyCalls).toBe(1);
    expect(respondCalls).toBe(1);
  });

  test("pauses for a plan decision without executing when planner asks for user choice", async () => {
    let verifyCalls = 0;
    let respondCalls = 0;
    const modelGateway = {
      async plan() {
        return {
          summary: "ASK_USER_DECISION: 登录界面有两种可行方向。",
          plannerResult: {
            workPackages: [],
            acceptanceCriteria: ["用户选择方案后再实现"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["选择后继续执行"],
            decisionRequest: {
              question: "请选择登录界面的实现方案",
              options: [
                {
                  id: "simple",
                  label: "简洁表单",
                  description: "只包含账号、密码和提交按钮。",
                  continuation: "按简洁表单方案实现登录界面。",
                },
                {
                  id: "brand",
                  label: "品牌化登录页",
                  description: "增加品牌区、辅助说明和更完整的视觉层次。",
                  continuation: "按品牌化登录页方案实现登录界面。",
                },
              ],
            },
          },
        };
      },
      execute: noExecutorToolCalls,
      async verify() {
        verifyCalls += 1;
        return { summary: "verified", isValid: true };
      },
      async respond() {
        respondCalls += 1;
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-plan-decision";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = {
      ...createThread("thread-plan-decision", workspaceRoot, ctx.config.projectId),
      threadMode: "plan" as const,
    };
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "我要开发一个登录界面");

    expect(result.status).toBe("completed");
    expect(result.planDecision?.question).toBe("请选择登录界面的实现方案");
    expect(result.planDecision?.sourceInput).toBe("我要开发一个登录界面");
    expect(result.finalResponse).toBeUndefined();
    const latestRun = await ctx.stores.runStore.getLatestByThread(thread.threadId);
    const activeSuspension = latestRun ? await ctx.stores.runStateStore.loadActiveSuspensionByRun(latestRun.runId) : undefined;
    const hydrated = await ctx.kernel.hydrateSession();
    expect(latestRun?.status).toBe("blocked");
    expect(latestRun?.blockingReason?.kind).toBe("plan_decision");
    expect(result.task.blockingReason?.kind).toBe("plan_decision");
    expect(activeSuspension?.reasonKind).toBe("waiting_plan_decision");
    expect(hydrated?.recoveryFacts?.blocking?.kind).toBe("plan_decision");
    expect(hydrated?.planDecision?.question).toBe("请选择登录界面的实现方案");
    expect(verifyCalls).toBe(0);
    expect(respondCalls).toBe(0);
  });

  test("does not fabricate file creation when implementation work has no concrete tool execution", async () => {
    let verifyCalls = 0;
    let respondCalls = 0;
    const modelGateway = {
      async plan() {
        return {
          summary: "实现登录界面组件。",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_login_form",
                objective: "创建 components/LoginForm.jsx 登录界面组件",
                capabilityMarker: "implementation_work" as const,
                capabilityFamily: "feature_implementation" as const,
                requiresApproval: false,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:components/LoginForm.jsx"],
              },
            ],
            acceptanceCriteria: ["登录组件文件存在"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["components/LoginForm.jsx"],
          },
        };
      },
      async verify() {
        verifyCalls += 1;
        return { summary: "verified", isValid: true };
      },
      async execute() {
        return {
          summary: "没有可执行工具调用",
          toolCalls: [],
        };
      },
      async respond() {
        respondCalls += 1;
        return { summary: "已创建登录界面组件 components/LoginForm.jsx。" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-no-fake-file";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-no-fake-file", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "我需要开发一个登录界面");

    expect(result.status).toBe("completed");
    expect(result.finalResponse).toContain("没有创建文件");
    expect(result.finalResponse).toContain("components/LoginForm.jsx");
    expect(result.executionSummary).toContain("未执行文件修改");
    expect(verifyCalls).toBe(0);
    expect(respondCalls).toBe(0);
    expect(await Bun.file(`${workspaceRoot}/components/LoginForm.jsx`).exists()).toBe(false);
  });

  test("creates files through structured executor tool calls", async () => {
    let executeCalls = 0;
    let verifyCalls = 0;
    let respondCalls = 0;
    const modelGateway = {
      async plan() {
        return {
          summary: "实现登录界面组件。",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_login_form",
                objective: "创建 components/LoginForm.jsx 登录界面组件",
                capabilityMarker: "implementation_work" as const,
                capabilityFamily: "feature_implementation" as const,
                requiresApproval: false,
                allowedTools: ["read_file", "apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:components/LoginForm.jsx"],
              },
            ],
            acceptanceCriteria: ["登录组件文件存在"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["components/LoginForm.jsx"],
          },
        };
      },
      async execute() {
        executeCalls += 1;
        return {
          summary: "创建登录组件文件",
          toolCalls: [
            {
              toolCallId: "tool_create_login_form",
              toolName: "apply_patch" as const,
              action: "create_file" as const,
              path: "components/LoginForm.jsx",
              changedFiles: 1,
              args: {
                content: "export function LoginForm() {\n  return <form aria-label=\"登录表单\" />;\n}\n",
              },
            },
          ],
        };
      },
      async verify() {
        verifyCalls += 1;
        return { summary: "verified", isValid: true };
      },
      async respond() {
        respondCalls += 1;
        return { summary: "已创建登录界面组件 components/LoginForm.jsx。" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = await mkdtemp(join(tmpdir(), "planner-workspace-executor-create-"));
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-executor-create-file", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "我需要开发一个登录界面");

    expect(result.status).toBe("completed");
    expect(result.executionSummary).toContain("apply_patch create_file components/LoginForm.jsx");
    expect(result.finalResponse).toContain("components/LoginForm.jsx");
    expect(executeCalls).toBe(1);
    expect(verifyCalls).toBe(1);
    expect(respondCalls).toBe(1);
    expect(await Bun.file(join(workspaceRoot, "components/LoginForm.jsx")).text()).toContain("LoginForm");
  });

  test("normalizes approval-gated delete intent when planner returns only a plain summary", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "Delete the scoped file only after explicit approval.",
        };
      },
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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
      execute: noExecutorToolCalls,
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
