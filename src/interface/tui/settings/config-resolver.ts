import {
  DEFAULT_SETTINGS_CONFIG,
  SETTINGS_CONFIG_KEYS,
  type PartialSettingsConfig,
  type SettingsConfig,
  type SettingsConfigKey,
  type SettingsConfigSource,
} from "./config-types";

export type ResolvedSettingsConfig = {
  global: SettingsConfig;
  project: PartialSettingsConfig;
  effective: SettingsConfig;
  sources: Record<SettingsConfigKey, SettingsConfigSource>;
};

export function resolveSettingsConfig(input: {
  global?: PartialSettingsConfig;
  project?: PartialSettingsConfig;
}): ResolvedSettingsConfig {
  const global = {
    ...DEFAULT_SETTINGS_CONFIG,
    ...(input.global ?? {}),
  };
  const project = input.project ?? {};
  const effective = {
    ...global,
    ...project,
  };
  const sources = SETTINGS_CONFIG_KEYS.reduce<Record<SettingsConfigKey, SettingsConfigSource>>((acc, key) => {
    if (project[key] !== undefined) {
      acc[key] = "project";
    } else if (input.global?.[key] !== undefined) {
      acc[key] = "global";
    } else {
      acc[key] = "default";
    }
    return acc;
  }, {} as Record<SettingsConfigKey, SettingsConfigSource>);

  return {
    global,
    project,
    effective,
    sources,
  };
}
