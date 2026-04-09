import type { ArtifactRecord } from "../runtime/artifacts/artifact-index";
import type { PlannerResult } from "../runtime/planning/planner-result";
import type { WorkPackage } from "../runtime/planning/work-package";
import type { ToolExecuteRequest } from "../control/tools/tool-types";
import { isAbsolute, relative } from "node:path";

type WorkerInputOptions = {
  input: string;
  currentWorkPackage?: WorkPackage;
  artifacts?: ArtifactRecord[];
  plannerResult?: PlannerResult;
};

type ExecutionArtifactOptions = {
  summary: string;
  currentWorkPackage?: WorkPackage;
  changedPath?: string;
};

export function buildExecutionInput(options: WorkerInputOptions): string {
  const rawInput = options.input.trim();
  const objective = options.currentWorkPackage?.objective.trim();
  if (!objective) {
    return rawInput;
  }

  const feedbackIndex = rawInput.indexOf("Verification failed:");
  if (feedbackIndex >= 0) {
    return `${objective}\n\n${rawInput.slice(feedbackIndex)}`.trim();
  }

  return objective;
}

export function buildVerifierPrompt(options: WorkerInputOptions): string {
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

  return [
    {
      ref: expectedRef,
      kind,
      summary: options.summary,
      workPackageId: currentWorkPackage.id,
    },
  ];
}

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

  return [
    {
      ref,
      kind: "patch",
      summary: input.summary,
      workPackageId: currentWorkPackage.id,
    },
  ];
}
