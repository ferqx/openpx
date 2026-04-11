import {
  evalReviewQueueFiltersSchema,
  evalReviewFollowUpSchema,
  evalReviewResolutionTypeSchema,
  evalReviewTriageStatusSchema,
  type EvalReviewQueueFilters,
  type EvalReviewFollowUp,
  type ReviewQueueAggregateSummary,
  type ReviewQueueItem,
} from "./eval-schema";
import { SqliteEvalStore } from "../persistence/sqlite/sqlite-eval-store";
import type { EvalReviewQueueRecord, EvalStorePort } from "../persistence/ports/eval-store-port";
import { resolveEvalDataDir as resolveInternalEvalDataDir } from "./eval-data-dir";

type EvalReviewCommandIo = {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
};

type RenderReviewQueueSummaryInput = {
  items: ReviewQueueItem[];
  triageStatus?: EvalReviewQueueFilters["triageStatus"];
  severity?: EvalReviewQueueFilters["severity"];
  scenarioId?: string;
  sourceType?: EvalReviewQueueFilters["sourceType"];
  resolutionType?: EvalReviewQueueFilters["resolutionType"];
};

type EvalReviewCommandOptions = {
  dataDir: string;
  filters: EvalReviewQueueFilters;
  closeReviewItemId?: string;
  resolutionType?: ReviewQueueItem["resolutionType"];
  ownerNote?: string;
  followUp?: EvalReviewFollowUp;
  statsOnly?: boolean;
  json?: boolean;
};

type EvalReviewCommandPayload = {
  filters: EvalReviewQueueFilters;
  aggregate: ReviewQueueAggregateSummary;
  items: ReviewQueueItem[];
};

function printUsage(io: EvalReviewCommandIo): void {
  io.stderr.write(
    "Usage: bun run eval:review [--data-dir <path>] [--status <open|triaged|closed>] [--severity <low|medium|high>] [--scenario <scenarioId>] [--source-type <outcome_check|trajectory_rule>] [--resolution-filter <scenario|rule|doc|accepted_noise>] [--stats-only] [--json] [--close <reviewItemId> --resolution <scenario|rule|doc|accepted_noise> --note <text> [--follow-up-suite <suiteId> --follow-up-scenario <scenarioId> [--follow-up-version <n>] | --follow-up-rule <ruleId> [--follow-up-rule-kind <outcome_check|trajectory_rule>] | --follow-up-doc <path>]]\n",
  );
}

function renderFilterSuffix(input: RenderReviewQueueSummaryInput): string {
  const filters = [
    input.triageStatus ? `status=${input.triageStatus}` : undefined,
    input.severity ? `severity=${input.severity}` : undefined,
    input.scenarioId ? `scenario=${input.scenarioId}` : undefined,
    input.sourceType ? `source=${input.sourceType}` : undefined,
    input.resolutionType ? `resolution=${input.resolutionType}` : undefined,
  ].filter((value): value is string => Boolean(value));

  return filters.length > 0 ? ` (${filters.join(", ")})` : "";
}

export function summarizeReviewQueue(items: ReviewQueueItem[]): ReviewQueueAggregateSummary {
  const summary: ReviewQueueAggregateSummary = {
    total: items.length,
    byTriageStatus: {
      open: 0,
      triaged: 0,
      closed: 0,
    },
    byResolutionType: {
      scenario: 0,
      rule: 0,
      doc: 0,
      accepted_noise: 0,
    },
    closedWithFollowUp: 0,
    closedMissingFollowUp: 0,
    acceptedNoiseCount: 0,
    bySeverity: {
      low: 0,
      medium: 0,
      high: 0,
    },
  };

  for (const item of items) {
    summary.byTriageStatus[item.triageStatus] += 1;
    summary.bySeverity[item.severity] += 1;

    if (item.resolutionType) {
      summary.byResolutionType[item.resolutionType] += 1;
      if (item.resolutionType === "accepted_noise") {
        summary.acceptedNoiseCount += 1;
      }
    }

    if (item.triageStatus === "closed") {
      if (item.followUp) {
        summary.closedWithFollowUp += 1;
      } else if (item.resolutionType && item.resolutionType !== "accepted_noise") {
        summary.closedMissingFollowUp += 1;
      }
    }
  }

  return summary;
}

export function renderReviewQueueAggregateSummary(summary: ReviewQueueAggregateSummary): string {
  const followUpDenominator = summary.byTriageStatus.closed - summary.acceptedNoiseCount;
  const followUpCoverage = followUpDenominator > 0
    ? `${summary.closedWithFollowUp}/${followUpDenominator}`
    : "n/a";

  const lines = [
    `Review queue aggregate: ${summary.total}`,
    `  triage: open=${summary.byTriageStatus.open} triaged=${summary.byTriageStatus.triaged} closed=${summary.byTriageStatus.closed}`,
    `  resolution: scenario=${summary.byResolutionType.scenario} rule=${summary.byResolutionType.rule} doc=${summary.byResolutionType.doc} accepted_noise=${summary.byResolutionType.accepted_noise}`,
    `  severity: high=${summary.bySeverity.high} medium=${summary.bySeverity.medium} low=${summary.bySeverity.low}`,
    `  follow-up coverage: ${followUpCoverage}`,
    `  closed with follow-up: ${summary.closedWithFollowUp}`,
    `  closed missing follow-up: ${summary.closedMissingFollowUp}`,
    `  accepted noise: ${summary.acceptedNoiseCount}`,
  ];

  return `${lines.join("\n")}\n`;
}

export function renderReviewQueueSummary(input: RenderReviewQueueSummaryInput): string {
  const normalized = evalReviewQueueFiltersSchema.parse({
    triageStatus: input.triageStatus,
    severity: input.severity,
    scenarioId: input.scenarioId,
    sourceType: input.sourceType,
    resolutionType: input.resolutionType,
  });

  const heading = normalized.triageStatus
    ? `${normalized.triageStatus.charAt(0).toUpperCase()}${normalized.triageStatus.slice(1)} review items`
    : "Review items";
  const lines = [`${heading}${renderFilterSuffix(input)}: ${input.items.length}`];

  if (input.items.length === 0) {
    lines.push("  none");
    return `${lines.join("\n")}\n`;
  }

  for (const item of input.items) {
    const statusParts = [
      item.triageStatus,
      item.resolutionType ? `resolution=${item.resolutionType}` : undefined,
      `severity=${item.severity}`,
    ].filter((value): value is string => Boolean(value));
    lines.push(`- ${item.reviewItemId} [${statusParts.join(", ")}] ${item.scenarioId} :: ${item.sourceId}`);
    lines.push(`  ${item.summary}`);
    if (item.ownerNote) {
      lines.push(`  note: ${item.ownerNote}`);
    }
    if (item.followUp) {
      lines.push(`  follow-up: ${formatFollowUp(item.followUp)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatFollowUp(followUp: EvalReviewFollowUp): string {
  if (followUp.kind === "scenario") {
    const version = followUp.scenarioVersion ? ` v${followUp.scenarioVersion}` : "";
    return `scenario ${followUp.suiteId}/${followUp.scenarioId}${version}`;
  }
  if (followUp.kind === "rule") {
    return `rule ${followUp.ruleId}${followUp.ruleKind ? ` (${followUp.ruleKind})` : ""}`;
  }
  return `doc ${followUp.docPath}`;
}

async function closeReviewItem(input: {
  store: SqliteEvalStore;
  reviewItemId: string;
  resolutionType: NonNullable<ReviewQueueItem["resolutionType"]>;
  ownerNote: string;
  followUp?: EvalReviewFollowUp;
}): Promise<ReviewQueueItem> {
  return input.store.updateReviewItem({
    reviewItemId: input.reviewItemId,
    triageStatus: "closed",
    resolutionType: input.resolutionType,
    ownerNote: input.ownerNote,
    followUp: input.followUp,
    closedAt: new Date().toISOString(),
  });
}

export function resolveEvalDataDir(input?: { workspaceRoot?: string; explicitDataDir?: string }): string {
  return resolveInternalEvalDataDir({
    workspaceRoot: input?.workspaceRoot ?? process.cwd(),
    explicitDataDir: input?.explicitDataDir,
  });
}

function parseRuleKind(value: string | undefined): "outcome_check" | "trajectory_rule" | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "outcome_check" || value === "trajectory_rule") {
    return value;
  }
  throw new Error(`Invalid follow-up rule kind: ${value}`);
}

function parseArgs(args: string[]): EvalReviewCommandOptions | undefined {
  let dataDir = resolveEvalDataDir({ workspaceRoot: process.cwd() });
  let triageStatus: EvalReviewQueueFilters["triageStatus"] | undefined = "open";
  let severity: EvalReviewQueueFilters["severity"] | undefined;
  let scenarioId: string | undefined;
  let sourceType: EvalReviewQueueFilters["sourceType"] | undefined;
  let resolutionFilter: EvalReviewQueueFilters["resolutionType"] | undefined;
  let closeReviewItemId: string | undefined;
  let resolutionType: ReviewQueueItem["resolutionType"];
  let ownerNote: string | undefined;
  let followUpSuiteId: string | undefined;
  let followUpScenarioId: string | undefined;
  let followUpScenarioVersion: number | undefined;
  let followUpRuleId: string | undefined;
  let followUpRuleKind: "outcome_check" | "trajectory_rule" | undefined;
  let followUpDocPath: string | undefined;
  let statsOnly = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--data-dir") {
      dataDir = args[index + 1] ?? dataDir;
      index += 1;
      continue;
    }
    if (arg === "--status") {
      triageStatus = evalReviewTriageStatusSchema.parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--severity") {
      severity = evalReviewQueueFiltersSchema.shape.severity.unwrap().parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--scenario") {
      scenarioId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--source-type") {
      sourceType = evalReviewQueueFiltersSchema.shape.sourceType.unwrap().parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--resolution-filter") {
      resolutionFilter = evalReviewResolutionTypeSchema.parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--close") {
      closeReviewItemId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--resolution") {
      resolutionType = evalReviewResolutionTypeSchema.parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--note") {
      ownerNote = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--follow-up-suite") {
      followUpSuiteId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--follow-up-scenario") {
      followUpScenarioId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--follow-up-version") {
      const rawValue = args[index + 1];
      followUpScenarioVersion = rawValue ? Number.parseInt(rawValue, 10) : undefined;
      index += 1;
      continue;
    }
    if (arg === "--follow-up-rule") {
      followUpRuleId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--follow-up-rule-kind") {
      followUpRuleKind = parseRuleKind(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--follow-up-doc") {
      followUpDocPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--help") {
      return undefined;
    }
    if (arg === "--stats-only") {
      statsOnly = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (closeReviewItemId && (!resolutionType || !ownerNote)) {
    throw new Error("Closing a review item requires both --resolution and --note.");
  }

  const followUp = buildFollowUp({
    resolutionType,
    suiteId: followUpSuiteId,
    scenarioId: followUpScenarioId,
    scenarioVersion: followUpScenarioVersion,
    ruleId: followUpRuleId,
    ruleKind: followUpRuleKind,
    docPath: followUpDocPath,
  });

  return {
    dataDir,
    filters: {
      triageStatus,
      severity,
      scenarioId,
      sourceType,
      resolutionType: resolutionFilter,
    },
    closeReviewItemId,
    resolutionType,
    ownerNote,
    followUp,
    statsOnly,
    json,
  };
}

function buildFollowUp(input: {
  resolutionType?: ReviewQueueItem["resolutionType"];
  suiteId?: string;
  scenarioId?: string;
  scenarioVersion?: number;
  ruleId?: string;
  ruleKind?: "outcome_check" | "trajectory_rule";
  docPath?: string;
}): EvalReviewFollowUp | undefined {
  if (input.resolutionType === "scenario") {
    return evalReviewFollowUpSchema.parse({
      kind: "scenario",
      suiteId: input.suiteId,
      scenarioId: input.scenarioId,
      scenarioVersion: input.scenarioVersion,
    });
  }
  if (input.resolutionType === "rule") {
    return evalReviewFollowUpSchema.parse({
      kind: "rule",
      ruleId: input.ruleId,
      ruleKind: input.ruleKind,
    });
  }
  if (input.resolutionType === "doc") {
    return evalReviewFollowUpSchema.parse({
      kind: "doc",
      docPath: input.docPath,
    });
  }
  return undefined;
}

export async function persistReviewQueueItemsToStore(
  store: Pick<EvalStorePort, "saveReviewRecords">,
  items: ReviewQueueItem[],
): Promise<ReviewQueueItem[]> {
  const records: EvalReviewQueueRecord[] = items.map((item) => ({ item }));
  await store.saveReviewRecords(records);
  return items;
}

export async function listReviewQueueItems(input: {
  dataDir: string;
  filters?: EvalReviewQueueFilters;
}): Promise<ReviewQueueItem[]> {
  const store = new SqliteEvalStore(input.dataDir);
  try {
    return await store.listReviewItems(input.filters);
  } finally {
    await store.close();
  }
}

export async function updateReviewQueueItem(input: {
  dataDir: string;
  reviewItemId: string;
  triageStatus?: ReviewQueueItem["triageStatus"];
  resolutionType?: ReviewQueueItem["resolutionType"];
  ownerNote?: string;
  followUp?: EvalReviewFollowUp;
  closedAt?: string;
}): Promise<ReviewQueueItem> {
  const store = new SqliteEvalStore(input.dataDir);
  try {
    return await store.updateReviewItem({
      reviewItemId: input.reviewItemId,
      triageStatus: input.triageStatus,
      resolutionType: input.resolutionType,
      ownerNote: input.ownerNote,
      followUp: input.followUp,
      closedAt: input.closedAt,
    });
  } finally {
    await store.close();
  }
}

export async function executeEvalReviewCommand(args: string[], io?: EvalReviewCommandIo): Promise<number> {
  const resolvedIo: EvalReviewCommandIo = io ?? {
    stdout: { write(chunk) { process.stdout.write(chunk); } },
    stderr: { write(chunk) { process.stderr.write(chunk); } },
  };

  let parsed: EvalReviewCommandOptions | undefined;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    resolvedIo.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    printUsage(resolvedIo);
    return 1;
  }

  if (!parsed) {
    printUsage(resolvedIo);
    return 0;
  }

  const store = new SqliteEvalStore(parsed.dataDir);
  try {
    if (parsed.closeReviewItemId && parsed.resolutionType && parsed.ownerNote) {
      const closed = await closeReviewItem({
        store,
        reviewItemId: parsed.closeReviewItemId,
        resolutionType: parsed.resolutionType,
        ownerNote: parsed.ownerNote,
        followUp: parsed.followUp,
      });
      if (!parsed.json) {
        resolvedIo.stdout.write(
          `Closed review item ${closed.reviewItemId} with resolution=${closed.resolutionType}.\n`,
        );
      }
    }

    const items = await store.listReviewItems(parsed.filters);
    const aggregate = summarizeReviewQueue(items);
    if (parsed.json) {
      const payload: EvalReviewCommandPayload = {
        filters: parsed.filters,
        aggregate,
        items,
      };
      resolvedIo.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    resolvedIo.stdout.write(renderReviewQueueAggregateSummary(aggregate));
    if (parsed.statsOnly) {
      return 0;
    }
    resolvedIo.stdout.write(renderReviewQueueSummary({
      items,
      triageStatus: parsed.filters.triageStatus,
      severity: parsed.filters.severity,
      scenarioId: parsed.filters.scenarioId,
      sourceType: parsed.filters.sourceType,
      resolutionType: parsed.filters.resolutionType,
    }));
    return 0;
  } finally {
    await store.close();
  }
}
