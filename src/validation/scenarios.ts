import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validationScenarioFileSpecSchema,
  validationScenarioSpecSchema,
  type ValidationPermissionMode,
  type ValidationScenarioFileSpec,
  type ValidationScenarioSpec,
  type ValidationScenarioSuiteId,
} from "./validation-schema";

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(validationDir, "..", "..");
export const defaultValidationScenarioSpecDir = path.join(validationDir, "scenario-specs");

export type ValidationScenarioDefinition = {
  sourcePath: string;
  enabled: boolean;
  suiteMemberships: readonly ValidationScenarioSuiteId[];
  availablePermissionModes: readonly ValidationPermissionMode[];
  spec: ValidationScenarioSpec;
};

export type ValidationScenarioRegistry = {
  specDir: string;
  workspaceRoot: string;
  definitions: readonly ValidationScenarioDefinition[];
};

function resolveLocalRepoPath(workspaceRoot: string, localPath: string): string {
  return path.isAbsolute(localPath) ? localPath : path.resolve(workspaceRoot, localPath);
}

function normalizeScenarioDefinition(input: {
  fileSpec: ValidationScenarioFileSpec;
  sourcePath: string;
  workspaceRoot: string;
}): ValidationScenarioDefinition {
  const resolvedLocalPath = resolveLocalRepoPath(input.workspaceRoot, input.fileSpec.repoSource.localPath);
  const availablePermissionModes = input.fileSpec.sandboxPolicy.availablePermissionModes
    ?? [input.fileSpec.sandboxPolicy.permissionMode];
  const spec = validationScenarioSpecSchema.parse({
    id: input.fileSpec.id,
    summary: input.fileSpec.summary,
    taskPrompt: input.fileSpec.taskPrompt,
    repoSource: {
      ...input.fileSpec.repoSource,
      localPath: resolvedLocalPath,
    },
    sandboxPolicy: {
      permissionMode: input.fileSpec.sandboxPolicy.permissionMode,
      networkMode: input.fileSpec.sandboxPolicy.networkMode,
      writableRoots: input.fileSpec.sandboxPolicy.writableRoots,
      allowedCommandClasses: input.fileSpec.sandboxPolicy.allowedCommandClasses,
      escalationCommandClasses: input.fileSpec.sandboxPolicy.escalationCommandClasses,
      destructiveActionPolicy: input.fileSpec.sandboxPolicy.destructiveActionPolicy,
    },
    taskFamily: input.fileSpec.taskFamily,
    scoringProfile: input.fileSpec.scoringProfile,
    backend: input.fileSpec.backend,
    acceptanceChecks: input.fileSpec.acceptanceChecks,
  });
  return {
    sourcePath: input.sourcePath,
    enabled: input.fileSpec.enabled ?? true,
    suiteMemberships: input.fileSpec.suites,
    availablePermissionModes,
    spec,
  };
}

export async function loadValidationScenarioRegistry(input?: {
  specDir?: string;
  workspaceRoot?: string;
}): Promise<ValidationScenarioRegistry> {
  const specDir = input?.specDir ?? defaultValidationScenarioSpecDir;
  const workspaceRoot = input?.workspaceRoot ?? repoRoot;
  const entries = await fs.readdir(specDir, { withFileTypes: true });
  const definitions: ValidationScenarioDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const sourcePath = path.join(specDir, entry.name);
    const parsedJson = JSON.parse(await fs.readFile(sourcePath, "utf8")) as unknown;
    const fileSpec = validationScenarioFileSpecSchema.parse(parsedJson);
    const definition = normalizeScenarioDefinition({
      fileSpec,
      sourcePath,
      workspaceRoot,
    });
    if (definition.enabled) {
      try {
        await fs.access(definition.spec.repoSource.localPath);
      } catch {
        throw new Error(
          `Configured validation repo path does not exist: ${definition.spec.repoSource.localPath} (${definition.spec.id})`,
        );
      }
    }
    definitions.push(definition);
  }

  return {
    specDir,
    workspaceRoot,
    definitions,
  };
}

export function defineValidationScenario(spec: ValidationScenarioSpec): ValidationScenarioSpec {
  return validationScenarioSpecSchema.parse(spec);
}

export function findValidationScenarioDefinition(
  registry: ValidationScenarioRegistry,
  id: string,
): ValidationScenarioDefinition | undefined {
  return registry.definitions.find((definition) => definition.spec.id === id);
}

export function findValidationScenario(
  registry: ValidationScenarioRegistry,
  id: string,
): ValidationScenarioSpec | undefined {
  return findValidationScenarioDefinition(registry, id)?.spec;
}

export function getValidationScenarioSpecs(registry: ValidationScenarioRegistry): readonly ValidationScenarioSpec[] {
  return registry.definitions.filter((definition) => definition.enabled).map((definition) => definition.spec);
}

function cloneScenarioWithPermissionMode(
  spec: ValidationScenarioSpec,
  permissionModeOverride: ValidationPermissionMode | undefined,
): ValidationScenarioSpec {
  if (!permissionModeOverride) {
    return spec;
  }
  return {
    ...spec,
    sandboxPolicy: {
      ...spec.sandboxPolicy,
      permissionMode: permissionModeOverride,
      destructiveActionPolicy: permissionModeOverride === "full_access" ? "allow" : spec.sandboxPolicy.destructiveActionPolicy,
    },
  };
}

export function resolveValidationSuiteScenarios(input: {
  registry: ValidationScenarioRegistry;
  suiteId: ValidationScenarioSuiteId;
  permissionModeOverride?: ValidationPermissionMode;
}): ValidationScenarioSpec[] {
  return input.registry.definitions
    .filter((definition) => definition.enabled && definition.suiteMemberships.includes(input.suiteId))
    .map((definition) => {
      if (input.permissionModeOverride && !definition.availablePermissionModes.includes(input.permissionModeOverride)) {
        throw new Error(
          `Validation scenario ${definition.spec.id} does not support permission mode ${input.permissionModeOverride}.`,
        );
      }
      return cloneScenarioWithPermissionMode(definition.spec, input.permissionModeOverride);
    });
}
