import path from "node:path";
import type { ResolvedConfigLayerName } from "./types";

/** 单层配置路径描述。 */
export type ConfigLayerPath = {
  name: ResolvedConfigLayerName;
  path: string;
};

/** capability 目录路径集合。 */
export type CapabilityDirectoryPaths = {
  agents: string[];
  skills: string[];
  tools: string[];
};

/** 配置系统路径集合。 */
export type OpenPXConfigPaths = {
  layers: ConfigLayerPath[];
  capabilityDirectories: CapabilityDirectoryPaths;
};

type PathEnvironment = Record<string, string | undefined>;

function resolvePathApi(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function resolveHomeDirectory(input: {
  homeDir?: string;
  workspaceRoot: string;
  platform: NodeJS.Platform;
  env: PathEnvironment;
}) {
  const pathApi = resolvePathApi(input.platform);
  if (input.homeDir) {
    return pathApi.resolve(input.homeDir);
  }
  if (input.platform === "win32") {
    const homeDir = input.env.USERPROFILE ?? input.env.HOME;
    if (!homeDir) {
      throw new Error("cannot resolve home directory for OpenPX config");
    }
    return pathApi.resolve(homeDir);
  }
  if (!input.env.HOME) {
    throw new Error("cannot resolve home directory for OpenPX config");
  }
  return pathApi.resolve(input.env.HOME);
}

function resolveUserConfigRoot(input: {
  homeDir: string;
  platform: NodeJS.Platform;
}) {
  const pathApi = resolvePathApi(input.platform);
  return pathApi.join(input.homeDir, ".openpx");
}

/** 解析 OpenPX v1 配置路径。 */
export function resolveOpenPXConfigPaths(input: {
  workspaceRoot: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  env?: PathEnvironment;
}): OpenPXConfigPaths {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const pathApi = resolvePathApi(platform);
  const workspaceRoot = pathApi.resolve(input.workspaceRoot);
  const homeDir = resolveHomeDirectory({
    homeDir: input.homeDir,
    workspaceRoot,
    platform,
    env,
  });
  const userRoot = resolveUserConfigRoot({
    homeDir,
    platform,
  });
  const projectRoot = pathApi.join(workspaceRoot, ".openpx");

  return {
    layers: [
      { name: "user", path: pathApi.join(userRoot, "openpx.jsonc") },
      { name: "project", path: pathApi.join(projectRoot, "openpx.jsonc") },
      { name: "project-local", path: pathApi.join(projectRoot, "settings.local.jsonc") },
    ],
    capabilityDirectories: {
      agents: [pathApi.join(userRoot, "agents"), pathApi.join(projectRoot, "agents")],
      skills: [pathApi.join(userRoot, "skills"), pathApi.join(projectRoot, "skills")],
      tools: [pathApi.join(userRoot, "tools"), pathApi.join(projectRoot, "tools")],
    },
  };
}
