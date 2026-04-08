import type { ArtifactRecord } from "../runtime/artifacts/artifact-index";
import type { PlannerResult } from "../runtime/planning/planner-result";
import type { WorkPackage } from "../runtime/planning/work-package";

type WorkerInputOptions = {
  input: string;
  currentWorkPackage?: WorkPackage;
  artifacts?: ArtifactRecord[];
  plannerResult?: PlannerResult;
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
