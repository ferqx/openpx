import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "jsonc-parser";
import { OPENPX_CONFIG_SCHEMA_URL, openPXConfigSchema } from "../../../config/schema";
import { resolveOpenPXConfigPaths } from "../../../config/paths";
import type { OpenPXConfig } from "../../../config/types";
import { resolveSettingsConfig, type ResolvedSettingsConfig } from "./config-resolver";
import type { PartialSettingsConfig } from "./config-types";

const LEGACY_OPENPX_CONFIG_SCHEMA_URL = "https://openpx.dev/schema/config-v1.json";

/** 设置存储接口：读合并配置，写 user/project-local 配置 */
export type SettingsConfigStore = {
  readResolved: () => Promise<
    ResolvedSettingsConfig & {
      paths: {
        user: string;
        project: string;
        projectLocal: string;
      };
    }
  >;
  writeUser: (config: PartialSettingsConfig) => Promise<void>;
  writeProjectLocal: (config: PartialSettingsConfig) => Promise<void>;
};

async function readOpenPXConfig(path: string): Promise<OpenPXConfig> {
  return readOpenPXConfigInternal(path, "tolerant");
}

async function readOpenPXConfigInternal(
  path: string,
  mode: "tolerant" | "strict",
): Promise<OpenPXConfig> {
  try {
    const raw = await readFile(path, "utf8");
    const errors: Array<{ error: number; offset: number; length: number }> = [];
    const parsed = parse(raw, errors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    if (errors.length > 0) {
      if (mode === "strict") {
        throw new Error(`cannot update settings because the current config file is invalid: ${path}`);
      }
      return {};
    }
    return openPXConfigSchema.parse(parsed);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    if (error instanceof Error && error.name === "ZodError") {
      if (mode === "strict") {
        throw new Error(`cannot update settings because the current config file is invalid: ${path}`);
      }
      return {};
    }
    if (error instanceof Error && mode === "strict" && error.message.includes("cannot update settings because the current config file is invalid")) {
      throw error;
    }

    throw error;
  }
}

function toSettingsSlice(config: OpenPXConfig): PartialSettingsConfig {
  return config.ui?.tui ?? {};
}

/** 写回 ui.tui 配置切片。 */
async function writeOpenPXConfig(path: string, config: PartialSettingsConfig): Promise<void> {
  const current = await readOpenPXConfigInternal(path, "strict");
  const { $schema: currentSchema, ...currentWithoutSchema } = current;
  const nextSchema = OPENPX_CONFIG_SCHEMA_URL
    ?? (currentSchema && currentSchema !== LEGACY_OPENPX_CONFIG_SCHEMA_URL ? currentSchema : undefined);
  const next: OpenPXConfig = openPXConfigSchema.parse({
    ...currentWithoutSchema,
    ...(nextSchema ? { $schema: nextSchema } : {}),
    ui: {
      ...(current.ui ?? {}),
      tui: config,
    },
  });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

/** 创建设置存储：user/project-local 可写，project 只读。 */
export function createSettingsConfigStore(input: {
  homeDir?: string;
  workspaceRoot: string;
}): SettingsConfigStore {
  const paths = resolveOpenPXConfigPaths({
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  const userPath = paths.layers.find((layer) => layer.name === "user")?.path ?? "";
  const projectPath = paths.layers.find((layer) => layer.name === "project")?.path ?? "";
  const projectLocalPath = paths.layers.find((layer) => layer.name === "project-local")?.path ?? "";

  return {
    async readResolved() {
      const [userConfig, projectConfig, projectLocalConfig] = await Promise.all([
        readOpenPXConfig(userPath),
        readOpenPXConfig(projectPath),
        readOpenPXConfig(projectLocalPath),
      ]);
      return {
        ...resolveSettingsConfig({
          user: toSettingsSlice(userConfig),
          project: toSettingsSlice(projectConfig),
          projectLocal: toSettingsSlice(projectLocalConfig),
        }),
        paths: {
          user: userPath,
          project: projectPath,
          projectLocal: projectLocalPath,
        },
      };
    },
    async writeUser(config) {
      await writeOpenPXConfig(userPath, config);
    },
    async writeProjectLocal(config) {
      await writeOpenPXConfig(projectLocalPath, config);
    },
  };
}

export { resolveSettingsConfig } from "./config-resolver";
