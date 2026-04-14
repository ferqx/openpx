/** 设置项键集合 */
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

/** 完整设置配置 */
export type SettingsConfig = Record<SettingsConfigKey, boolean>;
export type PartialSettingsConfig = Partial<SettingsConfig>;
export type SettingsConfigScope = "global" | "project";
export type SettingsConfigSource = "default" | "global" | "project";

/** 默认设置值 */
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

/** 设置键列表 */
export const SETTINGS_CONFIG_KEYS = Object.keys(DEFAULT_SETTINGS_CONFIG) as SettingsConfigKey[];
