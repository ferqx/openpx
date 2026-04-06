import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveSettingsConfig, type ResolvedSettingsConfig } from "./config-resolver";
import type { PartialSettingsConfig } from "./config-types";

export type SettingsConfigStore = {
  readResolved: () => Promise<
    ResolvedSettingsConfig & {
      paths: {
        global: string;
        project: string;
      };
    }
  >;
  writeGlobal: (config: PartialSettingsConfig) => Promise<void>;
  writeProject: (config: PartialSettingsConfig) => Promise<void>;
};

async function readConfigFile(path: string): Promise<PartialSettingsConfig> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as PartialSettingsConfig;
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.name === "SyntaxError")
    ) {
      return {};
    }

    throw error;
  }
}

async function writeConfigFile(path: string, config: PartialSettingsConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function createSettingsConfigStore(input: {
  homeDir: string;
  workspaceRoot: string;
}): SettingsConfigStore {
  const globalPath = join(input.homeDir, ".openpx", "config.json");
  const projectPath = join(input.workspaceRoot, ".openpx", "config.json");

  return {
    async readResolved() {
      const [global, project] = await Promise.all([
        readConfigFile(globalPath),
        readConfigFile(projectPath),
      ]);
      return {
        ...resolveSettingsConfig({ global, project }),
        paths: {
          global: globalPath,
          project: projectPath,
        },
      };
    },
    async writeGlobal(config) {
      await writeConfigFile(globalPath, config);
    },
    async writeProject(config) {
      await writeConfigFile(projectPath, config);
    },
  };
}

export { resolveSettingsConfig } from "./config-resolver";
