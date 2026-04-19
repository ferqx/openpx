import {
  DEFAULT_TUI_UI_CONFIG,
  TUI_UI_KEYS,
  type TuiUIConfig,
  type TuiUIConfigKey,
} from "../../../config/types";

/** 完整设置配置。 */
export type SettingsConfig = TuiUIConfig;
export type SettingsConfigKey = TuiUIConfigKey;
export type PartialSettingsConfig = Partial<SettingsConfig>;
export type SettingsConfigScope = "user" | "project-local";
export type SettingsConfigSource = "default" | "user" | "project" | "project-local";

/** 默认设置值。 */
export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = DEFAULT_TUI_UI_CONFIG;

/** 设置键列表。 */
export const SETTINGS_CONFIG_KEYS = TUI_UI_KEYS;
