import type { OpenPXConfig } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (isPlainObject(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneValue(entry);
    }
    return cloned as T;
  }
  return value;
}

function mergeValue<T>(base: T, override: T): T {
  if (override === undefined) {
    return cloneValue(base);
  }
  if (override === null) {
    return override;
  }
  if (Array.isArray(override)) {
    return cloneValue(override) as T;
  }
  if (!isPlainObject(override)) {
    return cloneValue(override);
  }
  if (!isPlainObject(base)) {
    return cloneValue(override);
  }

  const merged: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(override)]);
  for (const key of keys) {
    const nextBase = base[key];
    const nextOverride = override[key];
    if (nextOverride === undefined) {
      merged[key] = cloneValue(nextBase);
      continue;
    }
    merged[key] = mergeValue(nextBase, nextOverride);
  }
  return merged as T;
}

/** 按 OpenPX v1 规则合并两层配置。 */
export function mergeOpenPXConfig(
  base: OpenPXConfig | undefined,
  override: OpenPXConfig | undefined,
): OpenPXConfig {
  if (!base && !override) {
    return {};
  }
  if (!base) {
    return cloneValue(override ?? {});
  }
  if (!override) {
    return cloneValue(base);
  }
  return mergeValue(base, override);
}
