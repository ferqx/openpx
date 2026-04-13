import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  findValidationScenarioDefinition,
  loadValidationScenarioRegistry,
  resolveValidationSuiteScenarios,
} from "../../src/validation/scenarios";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeScenarioSpec(specDir: string, name: string, localPath: string): Promise<void> {
  await fs.mkdir(specDir, { recursive: true });
  await Bun.write(
    path.join(specDir, `${name}.json`),
    JSON.stringify(
      {
        id: name,
        summary: `${name} summary`,
        taskPrompt: "repair the task",
        repoSource: {
          repoId: `${name}-repo`,
          snapshot: "workspace",
          localPath,
        },
        sandboxPolicy: {
          permissionMode: "guarded",
          availablePermissionModes: ["guarded", "full_access"],
          networkMode: "off",
          writableRoots: ["workspace"],
          allowedCommandClasses: ["read", "test"],
          escalationCommandClasses: ["destructive_shell"],
          destructiveActionPolicy: "ask",
        },
        taskFamily: {
          primary: "approval_control",
          secondary: ["shell_execution"],
        },
        scoringProfile: {
          outcomeWeight: 0.4,
          trajectoryWeight: 0.3,
          controlWeight: 0.3,
        },
        backend: {
          kind: "deterministic_eval",
          suiteId: "core-eval-suite",
          scenarioId: "approval-required-then-approved",
        },
        acceptanceChecks: [],
        suites: ["engineering", "release_gate"],
      },
      null,
      2,
    ),
  );
}

describe("validation registry", () => {
  test("loads data-file specs, resolves local paths, and preserves suite memberships", async () => {
    const workspaceRoot = await createTempDir("openpx-validation-workspace-");
    const specDir = path.join(workspaceRoot, "scenario-specs");
    const repoRoot = path.join(workspaceRoot, "repos", "openpx");
    await fs.mkdir(repoRoot, { recursive: true });
    await writeScenarioSpec(specDir, "openpx-deterministic", "./repos/openpx");

    const registry = await loadValidationScenarioRegistry({
      specDir,
      workspaceRoot,
    });

    expect(registry.definitions).toHaveLength(1);
    expect(registry.definitions[0]?.spec.repoSource.localPath).toBe(repoRoot);
    expect(registry.definitions[0]?.suiteMemberships).toEqual(["engineering", "release_gate"]);
    expect(registry.definitions[0]?.availablePermissionModes).toEqual(["guarded", "full_access"]);
  });

  test("resolves named suites and applies permission mode overrides without mutating stored specs", async () => {
    const workspaceRoot = await createTempDir("openpx-validation-suite-");
    const specDir = path.join(workspaceRoot, "scenario-specs");
    const repoRoot = path.join(workspaceRoot, "repos", "openpx");
    await fs.mkdir(repoRoot, { recursive: true });
    await writeScenarioSpec(specDir, "openpx-deterministic", "./repos/openpx");

    const registry = await loadValidationScenarioRegistry({
      specDir,
      workspaceRoot,
    });

    const suiteScenarios = resolveValidationSuiteScenarios({
      registry,
      suiteId: "engineering",
      permissionModeOverride: "full_access",
    });
    const original = findValidationScenarioDefinition(registry, "openpx-deterministic");

    expect(suiteScenarios).toHaveLength(1);
    expect(suiteScenarios[0]?.sandboxPolicy.permissionMode).toBe("full_access");
    expect(original?.spec.sandboxPolicy.permissionMode).toBe("guarded");
  });

  test("fails clearly when a configured local repo path does not exist", async () => {
    const workspaceRoot = await createTempDir("openpx-validation-missing-");
    const specDir = path.join(workspaceRoot, "scenario-specs");
    await writeScenarioSpec(specDir, "missing-repo", "./repos/does-not-exist");

    await expect(
      loadValidationScenarioRegistry({
        specDir,
        workspaceRoot,
      }),
    ).rejects.toThrow("Configured validation repo path does not exist");
  });
});
