import { mergeOpenPXConfig } from "./merge";
import { loadCapabilityInventory, loadConfigLayers } from "./loader";
import { normalizeOpenPXConfig } from "./normalize";
import { resolveOpenPXConfigPaths } from "./paths";
import { validateResolvedOpenPXConfig } from "./validator";
import type { ResolvedOpenPXConfig } from "./types";

/** 读取并解析 OpenPX v1 配置。 */
export function loadAndResolveOpenPXConfig(input: {
  workspaceRoot: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  allowMissingModel?: boolean;
}): ResolvedOpenPXConfig {
  const paths = resolveOpenPXConfigPaths({
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
  });
  const layers = loadConfigLayers(paths);
  const inventory = loadCapabilityInventory(paths);
  const envFallback = layers.every((layer) => !layer.exists);
  const merged = normalizeOpenPXConfig(
    layers.reduce((acc, layer) => mergeOpenPXConfig(acc, layer.config), {}),
  );

  validateResolvedOpenPXConfig({
    config: merged,
    inventory,
    allowMissingModel: input.allowMissingModel,
  });

  return {
    config: merged,
    layers,
    inventory,
    envFallback,
  };
}
