import type { PlannerResult } from "./planner-result";
import type {
  WorkPackage,
  WorkPackageCapabilityFamily,
  WorkPackageCapabilityMarker,
  WorkPackageReplanHint,
} from "./work-package";

/** planner 归一化输入：原始用户文本、planner 摘要及可选结构化输出 */
type NormalizePlannerInput = {
  inputText: string;
  summary: string;
  plannerResult?: PlannerResult;
};

/** planner 归一化输出：稳定摘要与修正后的 PlannerResult */
type NormalizePlannerOutput = {
  summary: string;
  plannerResult: PlannerResult;
};

const REPLAN_HINT_TOKEN = "avoid_same_capability_marker";

/** 统一空白字符，方便做启发式匹配 */
function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** 清理路径候选，去掉引号和尾部标点 */
function cleanPathCandidate(value: string): string {
  return value.trim().replace(/^['"`]+|['"`]+$/g, "").replace(/[.,;:!?]+$/g, "");
}

/** 从自由文本中提取文件路径引用 */
function extractPathReference(value: string): string | undefined {
  const match = value.match(/['"`]?([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)['"`]?/);
  return match?.[1] ? cleanPathCandidate(match[1]) : undefined;
}

/** 专门提取 delete/remove 语义中的目标文件路径 */
function extractDeletePath(value: string): string | undefined {
  const patterns = [
    /(?:delete|remove)\s+(?:the\s+file\s+)?['"`]?([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)['"`]?/i,
    /([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)\s+(?:should\s+be\s+)?(?:deleted|removed)/i,
    /file\s+['"`]?([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)['"`]?\s+.*(?:approval|apply)/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const candidate = match?.[1] ? cleanPathCandidate(match[1]) : undefined;
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function extractDeletePathFromWorkPackage(workPackage: WorkPackage): string | undefined {
  const fromObjective = extractDeletePath(workPackage.objective);
  if (fromObjective) {
    return fromObjective;
  }

  for (const inputRef of workPackage.inputRefs) {
    if (inputRef.startsWith("file:")) {
      return inputRef.slice("file:".length);
    }
  }

  const patchArtifact = workPackage.expectedArtifacts.find((artifact) => artifact.startsWith("patch:"));
  if (patchArtifact) {
    const candidate = patchArtifact.slice("patch:".length);
    if (candidate !== "file") {
      return candidate;
    }
  }

  return undefined;
}

function approvalActionsSuggestDelete(actions: readonly string[]): boolean {
  return actions.some((action) => {
    const normalized = action.toLowerCase();
    return normalized.includes("apply_patch") && (normalized.includes("delete") || normalized.includes("deletion"));
  });
}

function objectiveSuggestsDelete(workPackage: WorkPackage, inputText: string): boolean {
  const combined = `${workPackage.objective}\n${inputText}`.toLowerCase();
  const referencedPath = extractPathReference(workPackage.objective) ?? extractPathReference(inputText);
  return Boolean(extractDeletePath(workPackage.objective))
    || Boolean(extractDeletePath(inputText))
    || (
      combined.includes("deletion patch")
      && combined.includes("approve")
      && Boolean(referencedPath)
    )
    || (
      Boolean(referencedPath)
      && (
        combined.includes("what would be deleted")
        || combined.includes("would be deleted")
        || combined.includes("deletion preview")
        || combined.includes("preview of the proposed cleanup")
        || combined.includes("cleanup (deletions)")
      )
      && (combined.includes("approve") || combined.includes("do not apply"))
    );
}

function inferReplanHint(inputText: string, workPackage?: WorkPackage): WorkPackageReplanHint | undefined {
  if (workPackage?.replanHint) {
    return workPackage.replanHint;
  }

  return inputText.includes(REPLAN_HINT_TOKEN) ? "avoid_same_capability_marker" : undefined;
}

function inferCapabilityMarker(input: {
  inputText: string;
  workPackage: WorkPackage;
  approvalRequiredActions: string[];
  replanHint?: WorkPackageReplanHint;
}): WorkPackageCapabilityMarker {
  const objectiveSignalsDelete = objectiveSuggestsDelete(input.workPackage, input.inputText);
  const approvalSuggestsDelete =
    input.approvalRequiredActions.includes("apply_patch.delete_file")
    || approvalActionsSuggestDelete(input.approvalRequiredActions);

  if (input.workPackage.capabilityMarker) {
    if (
      input.workPackage.capabilityMarker === "respond_only"
      && (objectiveSignalsDelete || approvalSuggestsDelete)
      && input.replanHint !== "avoid_same_capability_marker"
    ) {
      return "apply_patch.delete_file";
    }
    return input.workPackage.capabilityMarker;
  }

  const approvalMarker = input.approvalRequiredActions.find(
    (action): action is WorkPackageCapabilityMarker =>
      action === "apply_patch.delete_file" || action === "respond_only",
  );
  if (approvalMarker) {
    if (input.replanHint === "avoid_same_capability_marker" && approvalMarker === "apply_patch.delete_file") {
      return "respond_only";
    }
    return approvalMarker;
  }

  if (input.replanHint === "avoid_same_capability_marker") {
    return "respond_only";
  }

  if (objectiveSignalsDelete || approvalSuggestsDelete) {
    return "apply_patch.delete_file";
  }

  return "respond_only";
}

function inferCapabilityFamily(input: {
  inputText: string;
  workPackage: WorkPackage;
  capabilityMarker: WorkPackageCapabilityMarker;
  replanHint?: WorkPackageReplanHint;
}): WorkPackageCapabilityFamily | undefined {
  if (input.workPackage.capabilityFamily) {
    return input.workPackage.capabilityFamily;
  }

  if (input.replanHint === "avoid_same_capability_marker") {
    return "reject_replan_delete";
  }

  if (input.capabilityMarker === "apply_patch.delete_file") {
    return "approval_gated_delete";
  }

  if (input.inputText.includes(REPLAN_HINT_TOKEN)) {
    return "reject_replan_delete";
  }

  return undefined;
}

function inferRequiresApproval(input: {
  workPackage: WorkPackage;
  capabilityMarker: WorkPackageCapabilityMarker;
  approvalRequiredActions: string[];
}): boolean | undefined {
  if (input.workPackage.requiresApproval !== undefined) {
    return input.workPackage.requiresApproval;
  }

  if (input.approvalRequiredActions.includes(input.capabilityMarker)) {
    return true;
  }

  if (input.capabilityMarker === "apply_patch.delete_file") {
    return true;
  }

  return false;
}

function normalizeExistingWorkPackage(
  workPackage: WorkPackage,
  inputText: string,
  approvalRequiredActions: string[],
): WorkPackage {
  const replanHint = inferReplanHint(inputText, workPackage);
  const capabilityMarker = inferCapabilityMarker({
    inputText,
    workPackage,
    approvalRequiredActions,
    replanHint,
  });
  const capabilityFamily = inferCapabilityFamily({
    inputText,
    workPackage,
    capabilityMarker,
    replanHint,
  });
  const requiresApproval = inferRequiresApproval({
    workPackage,
    capabilityMarker,
    approvalRequiredActions,
  });

  const deletePath = extractDeletePathFromWorkPackage(workPackage)
    ?? extractDeletePath(inputText)
    ?? extractPathReference(workPackage.objective)
    ?? extractPathReference(inputText);
  const normalizedObjective = capabilityMarker === "apply_patch.delete_file" && deletePath
    ? `delete ${deletePath}`
    : normalizeWhitespace(workPackage.objective);

  return {
    ...workPackage,
    objective: normalizedObjective,
    capabilityMarker,
    capabilityFamily,
    requiresApproval,
    replanHint,
    inputRefs:
      capabilityMarker === "apply_patch.delete_file" && deletePath && !workPackage.inputRefs.some((item) => item === `file:${deletePath}`)
        ? [...workPackage.inputRefs, `file:${deletePath}`]
        : workPackage.inputRefs,
    expectedArtifacts:
      capabilityMarker === "apply_patch.delete_file" && deletePath && !workPackage.expectedArtifacts.some((item) => item === `patch:${deletePath}`)
        ? [`patch:${deletePath}`, ...workPackage.expectedArtifacts]
        : workPackage.expectedArtifacts,
  };
}

function createSyntheticWorkPackage(inputText: string, summary: string): WorkPackage {
  const replanHint = inferReplanHint(inputText);
  const deletePath = extractDeletePath(inputText) ?? extractDeletePath(summary);

  if (deletePath && replanHint !== "avoid_same_capability_marker") {
    return {
      id: "pkg_delete",
      objective: `delete ${deletePath}`,
      capabilityMarker: "apply_patch.delete_file",
      capabilityFamily: "approval_gated_delete",
      requiresApproval: true,
      allowedTools: ["apply_patch"],
      inputRefs: ["thread:goal", `file:${deletePath}`],
      expectedArtifacts: [`patch:${deletePath}`],
    };
  }

  return {
    id: replanHint === "avoid_same_capability_marker" ? "pkg_safe_replan" : "pkg_response",
    objective:
      replanHint === "avoid_same_capability_marker"
        ? "continue safely without deleting files"
        : normalizeWhitespace(summary || inputText),
    capabilityMarker: "respond_only",
    capabilityFamily: replanHint === "avoid_same_capability_marker" ? "reject_replan_delete" : undefined,
    requiresApproval: false,
    replanHint,
    allowedTools: ["read_file"],
    inputRefs: ["thread:goal"],
    expectedArtifacts: [replanHint === "avoid_same_capability_marker" ? "response:safe-replan" : "summary:response"],
  };
}

function normalizePlannerResult(inputText: string, summary: string, plannerResult?: PlannerResult): PlannerResult {
  const base = plannerResult ?? {
    workPackages: [],
    acceptanceCriteria: [],
    riskFlags: [],
    approvalRequiredActions: [],
    verificationScope: [],
  };

  const workPackages = base.workPackages.length > 0
    ? base.workPackages.map((workPackage) => normalizeExistingWorkPackage(workPackage, inputText, base.approvalRequiredActions))
    : [createSyntheticWorkPackage(inputText, summary)];

  const firstWorkPackage = workPackages[0];
  const approvalRequiredActions = [...base.approvalRequiredActions];
  if (
    firstWorkPackage?.capabilityMarker === "apply_patch.delete_file"
    && !approvalRequiredActions.includes("apply_patch.delete_file")
  ) {
    approvalRequiredActions.push("apply_patch.delete_file");
  }

  return {
    ...base,
    workPackages,
    approvalRequiredActions,
  };
}

export function normalizePlannerOutput(input: NormalizePlannerInput): NormalizePlannerOutput {
  return {
    summary: input.summary,
    plannerResult: normalizePlannerResult(input.inputText, input.summary, input.plannerResult),
  };
}

export function buildRejectedApprovalReason(summary: string, capabilityMarker?: string): string {
  const marker = capabilityMarker?.trim() || "unknown_capability";
  return `Tool approval was rejected for capability ${marker}. Original summary: ${summary}. Replan safely with ${REPLAN_HINT_TOKEN}.`;
}

export function deriveCapabilityMarkerFromApprovalSummary(summary: string): WorkPackageCapabilityMarker | undefined {
  if (summary.includes("delete_file")) {
    return "apply_patch.delete_file";
  }

  return undefined;
}
