/** 
 * @module shared/config
 * 应用配置（AppConfig）解析模块。
 * 
 * 负责从工作区目录和分层配置文件中解析出应用运行所需的完整配置，
 * 包括工作区根路径、项目标识、数据目录和模型参数。
 * 
 * 术语对照：workspaceRoot=工作区根路径，projectId=项目标识，
 * dataDir=数据目录
 */
import { isAbsolute, join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { loadAndResolveOpenPXConfig } from "../config/resolver";
import type {
  ModelRefConfig,
  OpenPXConfig,
  PermissionMode,
  ProviderDefinitionConfig,
  ResolvedOpenPXConfig,
} from "../config/types";
import {
  resolveProviderBinding,
  type ResolvedProviderBinding,
} from "../infra/provider/profile";
import {
  createDefaultModelSelectionPolicy,
  type ResolvedModelSlot,
  type ModelSelectionPolicy,
} from "../infra/provider/selection-policy";
import {
  createDefaultRetryPolicy,
  type RetryPolicy,
} from "../infra/provider/retry-policy";

/** 模型配置：provider profile + fallback + model selection policy。 */
export type AppModelConfig = {
  configured: boolean;
  default: ResolvedModelSlot;
  small: ResolvedModelSlot;
  selectionPolicy: ModelSelectionPolicy;
  retryPolicy: RetryPolicy;
  enableTelemetry: boolean;
  enableCostTracking: boolean;
  thinking?: "high" | "medium" | "low" | "off";
};

/** 返回当前主 profile，用于 smoke/TUI/telemetry 等只读场景。 */
export function getPrimaryProviderBinding(model: AppModelConfig): ResolvedProviderBinding {
  return model.default.provider;
}

/** 返回当前主 profile 的默认模型名。 */
export function getPrimaryModelName(model: AppModelConfig): string {
  return model.default.name;
}

/** 返回当前主 profile 的基准 baseURL。 */
export function getPrimaryBaseURL(model: AppModelConfig): string {
  return model.default.provider.profile.baseURL;
}

/** 应用配置类型，包含工作区、项目和模型相关参数 */
export type AppPermissionConfig = {
  defaultMode: PermissionMode;
  additionalDirectories: string[];
};

/** 应用配置类型，包含工作区、项目和模型相关参数 */
export type AppConfig = {
  workspaceRoot: string;             // 工作区根路径
  projectId: string;                 // 项目标识，用于隔离不同项目的数据
  dataDir: string;                   // 数据存储目录
  model: AppModelConfig;             // 模型相关配置
  permission: AppPermissionConfig;   // 权限相关配置
};

/** 从 package.json 或目录名解析项目标识，找不到时回退到 "default-project" */
function resolveProjectId(workspaceRoot: string): string {
  const pkgPath = join(workspaceRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;  // 优先使用 package.json 中的 name 字段
    } catch {
      // 解析失败时忽略，回退到目录名
    }
  }
  // 无法从 package.json 获取时，取路径最后一段作为项目标识
  return resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

function createUnconfiguredModelSlot(): ResolvedModelSlot {
  return {
    provider: {
      profile: {
        providerId: "unconfigured",
        displayName: "Unconfigured",
        baseURL: "https://invalid.invalid/v1",
        supportsStreaming: true,
        supportsJsonMode: true,
        supportsUsageFields: true,
        unsupportedParams: [],
        notes: "No provider/model config has been supplied yet.",
      },
      apiKey: undefined,
    },
    name: "unconfigured",
  };
}

function buildRetryPolicy(config: OpenPXConfig): RetryPolicy {
  const defaults = createDefaultRetryPolicy();
  const timeoutMs = config.runtime?.timeoutMs;
  return {
    ...defaults,
    maxRetries: config.runtime?.maxRetries ?? defaults.maxRetries,
    operationTimeoutMs: timeoutMs === undefined
      ? defaults.operationTimeoutMs
      : {
          plan: timeoutMs,
          verify: timeoutMs,
          respond: timeoutMs,
        },
  };
}

function resolveBindingFromConfig(input: {
  providerId: string;
  config: OpenPXConfig;
}): ResolvedProviderBinding {
  const providerDefinition = input.config.provider?.[input.providerId];
  if (!providerDefinition) {
    throw new Error(`unknown provider: ${input.providerId}`);
  }
  return resolveProviderBinding({
    providerId: input.providerId,
    definition: providerDefinition,
  });
}

function resolveModelSlot(input: {
  slotName: "default" | "small";
  modelRef: ModelRefConfig | null | undefined;
  providers: Record<string, ProviderDefinitionConfig> | undefined;
  config: OpenPXConfig;
}): ResolvedModelSlot {
  const providerId = input.modelRef?.provider;
  const modelName = input.modelRef?.name;
  if (!providerId || !modelName) {
    throw new Error(`model.${input.slotName} is incomplete`);
  }
  if (!input.providers?.[providerId]) {
    throw new Error(`model.${input.slotName} references unknown provider: ${providerId}`);
  }

  return {
    provider: resolveBindingFromConfig({
      providerId,
      config: input.config,
    }),
    name: modelName,
  };
}

function buildConfiguredModelConfig(input: {
  config: OpenPXConfig;
  allowMissingModel?: boolean;
}): AppModelConfig {
  const defaultModelRef = input.config.model?.default;
  if ((defaultModelRef === undefined || defaultModelRef === null) && input.allowMissingModel) {
    return {
      configured: false,
      default: createUnconfiguredModelSlot(),
      small: createUnconfiguredModelSlot(),
      selectionPolicy: createDefaultModelSelectionPolicy(),
      retryPolicy: buildRetryPolicy(input.config),
      enableTelemetry: input.config.runtime?.enableTelemetry ?? true,
      enableCostTracking: input.config.runtime?.enableCostTracking ?? true,
      thinking: input.config.runtime?.thinkingLevel,
    };
  }

  const defaultSlot = resolveModelSlot({
    slotName: "default",
    modelRef: defaultModelRef,
    providers: input.config.provider,
    config: input.config,
  });
  const smallModelRef = input.config.model?.small;

  return {
    configured: true,
    default: defaultSlot,
    small: smallModelRef === undefined || smallModelRef === null
      ? defaultSlot
      : resolveModelSlot({
          slotName: "small",
          modelRef: smallModelRef,
          providers: input.config.provider,
          config: input.config,
        }),
    selectionPolicy: createDefaultModelSelectionPolicy(),
    retryPolicy: buildRetryPolicy(input.config),
    enableTelemetry: input.config.runtime?.enableTelemetry ?? true,
    enableCostTracking: input.config.runtime?.enableCostTracking ?? true,
    thinking: input.config.runtime?.thinkingLevel,
  };
}

function buildPermissionConfig(config: OpenPXConfig, workspaceRoot: string): AppPermissionConfig {
  return {
    defaultMode: config.permission?.defaultMode ?? "guarded",
    additionalDirectories: (config.permission?.additionalDirectories ?? []).map((directory) =>
      isAbsolute(directory) ? directory : resolve(workspaceRoot, directory)
    ),
  };
}

/** 解析多层配置文件，供上层装配或测试复用。 */
export function loadResolvedOpenPXConfig(input: {
  workspaceRoot: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  allowMissingModel?: boolean;
}): ResolvedOpenPXConfig {
  return loadAndResolveOpenPXConfig(input);
}

/** 把多层配置投影成 runtime-facing AppConfig。 */
export function buildAppConfigFromResolvedConfig(input: {
  resolvedConfig: ResolvedOpenPXConfig;
  workspaceRoot: string;
  dataDir: string;
  projectId?: string;
  env?: Record<string, string | undefined>;
  allowMissingModel?: boolean;
}): AppConfig {
  const workspaceRoot = resolve(input.workspaceRoot);
  const projectId = input.projectId ?? resolveProjectId(workspaceRoot);

  return {
    workspaceRoot,
    projectId,
    dataDir: input.dataDir,
    model: buildConfiguredModelConfig({
      config: input.resolvedConfig.config,
      allowMissingModel: input.allowMissingModel,
    }),
    permission: buildPermissionConfig(input.resolvedConfig.config, workspaceRoot),
  };
}

/** 解析并组装完整的 AppConfig，自动推断缺失的项目标识和模型参数。 */
export function resolveConfig(input: { 
  workspaceRoot: string;             // 工作区根路径 
  dataDir: string;                   // 数据存储目录
  projectId?: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  allowMissingModel?: boolean;
}): AppConfig {
  const env = input.env ?? process.env;
  const resolvedConfig = loadResolvedOpenPXConfig({
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
    env,
    allowMissingModel: input.allowMissingModel,
  });

  return buildAppConfigFromResolvedConfig({
    resolvedConfig,
    workspaceRoot: input.workspaceRoot,
    dataDir: input.dataDir,
    projectId: input.projectId,
    env,
    allowMissingModel: input.allowMissingModel,
  });
}
