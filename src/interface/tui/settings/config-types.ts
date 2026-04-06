export type SettingsConfigKey =
  | "autoCompact"
  | "showTips"
  | "reduceMotion"
  | "thinkingMode"
  | "fastMode"
  | "promptSuggestions"
  | "rewindCode"
  | "verboseOutput"
  | "terminalProgressBar";

export type SettingsConfig = Record<SettingsConfigKey, boolean>;
export type PartialSettingsConfig = Partial<SettingsConfig>;
export type SettingsConfigScope = "global" | "project";
export type SettingsConfigSource = "default" | "global" | "project";

export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
  autoCompact: true,
  showTips: true,
  reduceMotion: false,
  thinkingMode: true,
  fastMode: false,
  promptSuggestions: true,
  rewindCode: true,
  verboseOutput: false,
  terminalProgressBar: true,
};

export const SETTINGS_CONFIG_KEYS = Object.keys(DEFAULT_SETTINGS_CONFIG) as SettingsConfigKey[];
