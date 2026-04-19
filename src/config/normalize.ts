import { mergeOpenPXConfig } from "./merge";
import { DEFAULT_OPENPX_CONFIG, type OpenPXConfig } from "./types";

/** 用默认值补齐 OpenPX 配置。 */
export function normalizeOpenPXConfig(config: OpenPXConfig): OpenPXConfig {
  return mergeOpenPXConfig(DEFAULT_OPENPX_CONFIG, config);
}
