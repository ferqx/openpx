import {
  DEFAULT_SETTINGS_CONFIG,
  SETTINGS_CONFIG_KEYS,
  type PartialSettingsConfig,
  type SettingsConfig,
  type SettingsConfigKey,
  type SettingsConfigSource,
} from "./config-types";

/** 解析后的设置配置：包含 user/project/projectLocal/effective 与来源 */
export type ResolvedSettingsConfig = {
  user: SettingsConfig;
  project: PartialSettingsConfig;
  projectLocal: PartialSettingsConfig;
  effective: SettingsConfig;
  sources: Record<SettingsConfigKey, SettingsConfigSource>;
};

/** 解析 user/project/project-local 配置，得到最终 effective 配置与来源映射 */
export function resolveSettingsConfig(input: {
  user?: PartialSettingsConfig;
  project?: PartialSettingsConfig;
  projectLocal?: PartialSettingsConfig;
}): ResolvedSettingsConfig {
  const user = {
    ...DEFAULT_SETTINGS_CONFIG,
    ...(input.user ?? {}),
  };
  const project = input.project ?? {};
  const projectLocal = input.projectLocal ?? {};
  const effective = {
    ...user,
    ...project,
    ...projectLocal,
  };
  const sources = SETTINGS_CONFIG_KEYS.reduce<Record<SettingsConfigKey, SettingsConfigSource>>((acc, key) => {
    if (projectLocal[key] !== undefined) {
      acc[key] = "project-local";
    } else if (project[key] !== undefined) {
      acc[key] = "project";
    } else if (input.user?.[key] !== undefined) {
      acc[key] = "user";
    } else {
      acc[key] = "default";
    }
    return acc;
  }, {} as Record<SettingsConfigKey, SettingsConfigSource>);

  return {
    user,
    project,
    projectLocal,
    effective,
    sources,
  };
}
