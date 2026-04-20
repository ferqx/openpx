import { isAbsolute, relative } from "node:path";
import type { ToolExecuteRequest } from "../control/tools/tool-types";
import type { ArtifactRecord } from "../runtime/artifacts/artifact-index";
import type { PlannerResult } from "../runtime/planning/planner-result";
import type { WorkPackage } from "../runtime/planning/work-package";

/** AgentRun 输入构建选项：围绕当前 work package、artifact 与 planner 输出裁剪上下文。 */
type AgentRunInputOptions = {
  input: string;
  currentWorkPackage?: WorkPackage;
  artifacts?: ArtifactRecord[];
  plannerResult?: PlannerResult;
};

/** 执行产物构建选项：用于把执行结果折叠成 artifact 记录 */
type ExecutionArtifactOptions = {
  summary: string;
  currentWorkPackage?: WorkPackage;
  changedPath?: string;
};

/** 构造 executor 输入：优先让执行 AgentRun 聚焦当前 work package objective。 */
export function buildExecutionInput(options: AgentRunInputOptions): string {
  const rawInput = options.input.trim();
  const objective = options.currentWorkPackage?.objective.trim();
  if (!objective) {
    return rawInput;
  }

  const feedbackIndex = rawInput.indexOf("Verification failed:");
  if (feedbackIndex >= 0) {
    // verifier 失败后的重试需要保留失败反馈，
    // 否则 executor AgentRun 无法知道本轮修复目标。
    return `${objective}\n\n${rawInput.slice(feedbackIndex)}`.trim();
  }

  return objective;
}

/** 构造 verifier 提示词：把目标、产物、范围和验收标准压成稳定结构 */
export function buildVerifierPrompt(options: AgentRunInputOptions): string {
  const rawInput = options.input.trim();
  const objective = options.currentWorkPackage?.objective.trim();
  const artifacts = options.artifacts ?? [];
  const verificationScope = options.plannerResult?.verificationScope ?? [];
  const acceptanceCriteria = options.plannerResult?.acceptanceCriteria ?? [];

  if (!objective && artifacts.length === 0 && verificationScope.length === 0 && acceptanceCriteria.length === 0) {
    return rawInput;
  }

  const sections = [
    `Verification target:\n${objective ?? rawInput}`,
  ];

  if (artifacts.length > 0) {
    sections.push(`Artifacts:\n${artifacts.map((artifact) => `- ${artifact.ref}: ${artifact.summary}`).join("\n")}`);
  }

  if (verificationScope.length > 0) {
    sections.push(`Verification scope:\n${verificationScope.map((item) => `- ${item}`).join("\n")}`);
  }

  if (acceptanceCriteria.length > 0) {
    sections.push(`Acceptance criteria:\n${acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

/** 根据当前 work package 生成最小 artifact 记录 */
export function buildExecutionArtifacts(options: ExecutionArtifactOptions): ArtifactRecord[] {
  const currentWorkPackage = options.currentWorkPackage;
  if (!currentWorkPackage) {
    return [];
  }

  const expectedRef =
    options.changedPath
      ? `patch:${options.changedPath}`
      : currentWorkPackage.expectedArtifacts[0] ?? `summary:${currentWorkPackage.id}`;
  const [kindCandidate] = expectedRef.split(":", 1);
  const kind = kindCandidate === "patch" || kindCandidate === "test" || kindCandidate === "log" || kindCandidate === "summary"
    ? kindCandidate
    : "summary";

  // 优先沿用 planner 期望的 artifact 引用名，方便后续 verifier / phase-commit 对齐。
  return [
    {
      ref: expectedRef,
      kind,
      summary: options.summary,
      workPackageId: currentWorkPackage.id,
    },
  ];
}

/** 为“审批通过后直接执行的工具调用”构造 patch artifact */
export function buildApprovedExecutionArtifacts(input: {
  workspaceRoot: string;
  toolRequest: ToolExecuteRequest;
  summary: string;
  currentWorkPackage?: WorkPackage;
}): ArtifactRecord[] {
  const currentWorkPackage = input.currentWorkPackage;
  if (!currentWorkPackage) {
    return [];
  }

  const requestPath = input.toolRequest.path;
  const relativePath = requestPath && isAbsolute(requestPath)
    ? relative(input.workspaceRoot, requestPath)
    : requestPath;
  const ref = relativePath && !relativePath.startsWith("..")
    ? `patch:${relativePath}`
    : currentWorkPackage.expectedArtifacts[0] ?? `summary:${currentWorkPackage.id}`;

  // 审批执行路径通常对应真实文件改动，因此这里默认归类为 patch。
  return [
    {
      ref,
      kind: "patch",
      summary: input.summary,
      workPackageId: currentWorkPackage.id,
    },
  ];
}
