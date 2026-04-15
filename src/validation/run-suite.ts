import path from "node:path";
import {
  renderValidationEngineeringView,
  renderValidationProductGateView,
} from "./reporting";
import { runValidationSuite } from "./orchestrator";
import {
  findValidationScenario,
  loadValidationScenarioRegistry,
  resolveValidationSuiteScenarios,
} from "./scenarios";
import {
  validationPermissionModeSchema,
  validationViewSchema,
  type ValidationPermissionMode,
  type ValidationScenarioSpec,
  type ValidationSuiteSummary,
  type ValidationView,
} from "./validation-schema";

type ValidationCliArgs = {
  suiteId?: "engineering" | "release_gate";
  scenarioId?: string;
  permissionModeOverride?: ValidationPermissionMode;
  outputRoot: string;
  dataDir: string;
  specDir?: string;
  json: boolean;
  view: ValidationView;
};

type ExecuteValidationSuiteCommandDeps = {
  writeLine?: (line: string) => void;
  resolveSuiteScenarios?: (input: {
    suiteId: "engineering" | "release_gate";
    permissionModeOverride?: ValidationPermissionMode;
    specDir?: string;
    workspaceRoot: string;
  }) => Promise<ValidationScenarioSpec[]>;
  findScenario?: (input: {
    scenarioId: string;
    permissionModeOverride?: ValidationPermissionMode;
    specDir?: string;
    workspaceRoot: string;
  }) => Promise<ValidationScenarioSpec | undefined>;
  runSuite?: (input: {
    scenarios: ValidationScenarioSpec[];
    rootDir: string;
    dataDir: string;
  }) => Promise<ValidationSuiteSummary>;
};

// validation 属于次级工具链，有自己的 CLI 契约；但这个文件应始终保持为
// 一个很薄的委托壳层，把真实逻辑留在 registry/orchestrator/reporting。
function parseArgs(argv: string[], cwd: string): ValidationCliArgs {
  let suiteId: ValidationCliArgs["suiteId"];
  let scenarioId: string | undefined;
  let permissionModeOverride: ValidationPermissionMode | undefined;
  let outputRoot = path.join(cwd, ".openpx", "validation");
  let dataDir = path.join(outputRoot, "validation.sqlite");
  let specDir: string | undefined;
  let json = false;
  let view: ValidationView = "engineering";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--suite" && next) {
      if (next !== "engineering" && next !== "release_gate") {
        throw new Error(`Unsupported validation suite: ${next}`);
      }
      suiteId = next;
      index += 1;
      continue;
    }
    if (arg === "--scenario" && next) {
      scenarioId = next;
      index += 1;
      continue;
    }
    if (arg === "--permission-mode" && next) {
      permissionModeOverride = validationPermissionModeSchema.parse(next);
      index += 1;
      continue;
    }
    if (arg === "--output-root" && next) {
      outputRoot = path.resolve(cwd, next);
      dataDir = path.join(outputRoot, "validation.sqlite");
      index += 1;
      continue;
    }
    if (arg === "--data-dir" && next) {
      dataDir = path.resolve(cwd, next);
      index += 1;
      continue;
    }
    if (arg === "--spec-dir" && next) {
      specDir = path.resolve(cwd, next);
      index += 1;
      continue;
    }
    if (arg === "--view" && next) {
      view = validationViewSchema.parse(next);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unknown validation argument: ${arg}`);
  }

  if (!suiteId && !scenarioId) {
    suiteId = "engineering";
  }
  if (suiteId && scenarioId) {
    throw new Error("Choose either --suite or --scenario, not both.");
  }

  return {
    suiteId,
    scenarioId,
    permissionModeOverride,
    outputRoot,
    dataDir,
    specDir,
    json,
    view,
  };
}

async function defaultResolveSuiteScenarios(input: {
  suiteId: "engineering" | "release_gate";
  permissionModeOverride?: ValidationPermissionMode;
  specDir?: string;
  workspaceRoot: string;
}): Promise<ValidationScenarioSpec[]> {
  const registry = await loadValidationScenarioRegistry({
    specDir: input.specDir,
    workspaceRoot: input.workspaceRoot,
  });
  return resolveValidationSuiteScenarios({
    registry,
    suiteId: input.suiteId,
    permissionModeOverride: input.permissionModeOverride,
  });
}

async function defaultFindScenario(input: {
  scenarioId: string;
  permissionModeOverride?: ValidationPermissionMode;
  specDir?: string;
  workspaceRoot: string;
}): Promise<ValidationScenarioSpec | undefined> {
  const registry = await loadValidationScenarioRegistry({
    specDir: input.specDir,
    workspaceRoot: input.workspaceRoot,
  });
  const scenario = findValidationScenario(registry, input.scenarioId);
  if (!scenario) {
    return undefined;
  }
  if (!input.permissionModeOverride) {
    return scenario;
  }
  return {
    ...scenario,
    sandboxPolicy: {
      ...scenario.sandboxPolicy,
      permissionMode: input.permissionModeOverride,
      destructiveActionPolicy: input.permissionModeOverride === "full_access" ? "allow" : scenario.sandboxPolicy.destructiveActionPolicy,
    },
  };
}

function renderSummary(summary: ValidationSuiteSummary, view: ValidationView, json: boolean): string {
  if (json) {
    return JSON.stringify(summary);
  }
  return view === "product_gate"
    ? renderValidationProductGateView(summary)
    : renderValidationEngineeringView(summary);
}

export async function executeValidationSuiteCommand(
  argv: string[],
  deps?: ExecuteValidationSuiteCommandDeps,
): Promise<number> {
  const writeLine = deps?.writeLine ?? ((line: string) => console.log(line));
  let args: ValidationCliArgs;
  try {
    args = parseArgs(argv, process.cwd());
  } catch (error) {
    writeLine(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const resolveSuite = deps?.resolveSuiteScenarios ?? defaultResolveSuiteScenarios;
  const findScenario = deps?.findScenario ?? defaultFindScenario;
  const runSuite = deps?.runSuite ?? (async (input) => runValidationSuite(input));

  try {
    const scenarios = args.scenarioId
      ? await (async () => {
          const scenario = await findScenario({
            scenarioId: args.scenarioId as string,
            permissionModeOverride: args.permissionModeOverride,
            specDir: args.specDir,
            workspaceRoot: process.cwd(),
          });
          if (!scenario) {
            throw new Error(`Unknown validation scenario: ${args.scenarioId}`);
          }
          return [scenario];
        })()
      : await resolveSuite({
          suiteId: args.suiteId as "engineering" | "release_gate",
          permissionModeOverride: args.permissionModeOverride,
          specDir: args.specDir,
          workspaceRoot: process.cwd(),
        });

    const summary = await runSuite({
      scenarios,
      rootDir: args.outputRoot,
      dataDir: args.dataDir,
    });
    writeLine(renderSummary(summary, args.view, args.json));
    return summary.releaseGate.blocked ? 1 : 0;
  } catch (error) {
    writeLine(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) {
  const exitCode = await executeValidationSuiteCommand(process.argv.slice(2));
  process.exitCode = exitCode;
}
