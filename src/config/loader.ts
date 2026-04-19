import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { openPXConfigSchema } from "./schema";
import type {
  OpenPXConfig,
  ResolvedConfigInventory,
  ResolvedConfigLayer,
} from "./types";
import type { ConfigLayerPath, OpenPXConfigPaths } from "./paths";

function parseJsoncFile(path: string): OpenPXConfig {
  const text = readFileSync(path, "utf8");
  const errors: Array<{ error: number; offset: number; length: number }> = [];
  const parsed = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(`invalid JSONC in ${path} at offset ${first?.offset ?? 0}`);
  }

  return openPXConfigSchema.parse(parsed);
}

/** 读取单层配置文件。 */
export function loadConfigLayer(path: ConfigLayerPath): ResolvedConfigLayer {
  if (!existsSync(path.path)) {
    return {
      name: path.name,
      path: path.path,
      exists: false,
    };
  }

  return {
    name: path.name,
    path: path.path,
    exists: true,
    config: parseJsoncFile(path.path),
  };
}

/** 批量读取所有配置层。 */
export function loadConfigLayers(paths: OpenPXConfigPaths): ResolvedConfigLayer[] {
  return paths.layers.map(loadConfigLayer);
}

function collectFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

/** 发现 capability 目录中的文件。 */
export function loadCapabilityInventory(paths: OpenPXConfigPaths): ResolvedConfigInventory {
  return {
    agents: paths.capabilityDirectories.agents.flatMap(collectFiles),
    skills: paths.capabilityDirectories.skills.flatMap(collectFiles),
    tools: paths.capabilityDirectories.tools.flatMap(collectFiles),
  };
}
