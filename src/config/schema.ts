import { z } from "zod";
import { DEFAULT_TUI_UI_CONFIG } from "./types";

const providerDefinitionConfigSchema = z.object({
  displayName: z.string().min(1).optional(),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  supportsStreaming: z.boolean().optional(),
  supportsJsonMode: z.boolean().optional(),
  supportsUsageFields: z.boolean().optional(),
  unsupportedParams: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
}).strict();

const providerConfigSchema = z.record(z.string().min(1), providerDefinitionConfigSchema);

const modelRefConfigSchema = z.object({
  provider: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
}).strict();

const modelConfigSchema = z.object({
  default: modelRefConfigSchema.nullable().optional(),
  small: modelRefConfigSchema.nullable().optional(),
}).strict();

const runtimePolicyConfigSchema = z.object({
  thinkingLevel: z.enum(["high", "medium", "low", "off"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
  chunkTimeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  enableTelemetry: z.boolean().optional(),
  enableCostTracking: z.boolean().optional(),
  compactionPolicy: z.string().min(1).optional(),
  workingSetPolicy: z.string().min(1).optional(),
}).strict();

const agentConfigSchema = z.object({
  defaultAgent: z.string().min(1).optional(),
  enablePlanner: z.boolean().optional(),
  enableVerifier: z.boolean().optional(),
  enableScout: z.boolean().optional(),
  enableSkills: z.boolean().optional(),
  maxSubagents: z.number().int().nonnegative().optional(),
  defaultMode: z.string().min(1).optional(),
}).strict();

const permissionConfigSchema = z.object({
  defaultMode: z.enum(["guarded", "full_access"]).optional(),
  allow: z.array(z.string().min(1)).optional(),
  ask: z.array(z.string().min(1)).optional(),
  deny: z.array(z.string().min(1)).optional(),
  additionalDirectories: z.array(z.string().min(1)).optional(),
  disableBypassMode: z.boolean().optional(),
}).strict();

const skillsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  autoload: z.boolean().optional(),
  directories: z.array(z.string().min(1)).optional(),
  allowlist: z.array(z.string().min(1)).optional(),
  denylist: z.array(z.string().min(1)).optional(),
  maxLoaded: z.number().int().positive().optional(),
}).strict();

const tuiConfigSchema = z.object({
  autoCompact: z.boolean().optional(),
  showTips: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  thinkingMode: z.boolean().optional(),
  fastMode: z.boolean().optional(),
  promptSuggestions: z.boolean().optional(),
  rewindCode: z.boolean().optional(),
  verboseOutput: z.boolean().optional(),
  terminalProgressBar: z.boolean().optional(),
}).strict();

const uiConfigSchema = z.object({
  theme: z.string().min(1).optional(),
  showCost: z.boolean().optional(),
  showTurnDuration: z.boolean().optional(),
  showLoopEvents: z.boolean().optional(),
  editorMode: z.string().min(1).optional(),
  tui: tuiConfigSchema.optional(),
}).strict();

/** OpenPX 主配置 schema。 */
export const openPXConfigSchema = z.object({
  $schema: z.string().url().optional(),
  provider: providerConfigSchema.optional(),
  model: modelConfigSchema.optional(),
  runtime: runtimePolicyConfigSchema.optional(),
  agent: agentConfigSchema.optional(),
  permission: permissionConfigSchema.optional(),
  skills: skillsConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
}).strict();

/** 默认 schema URL。 */
export const OPENPX_CONFIG_SCHEMA_URL: string | undefined = undefined;

const generatedSchema = z.toJSONSchema(openPXConfigSchema);

/** 给 JSONC 文件使用的 JSON Schema 产物。 */
export const openPXConfigJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...(OPENPX_CONFIG_SCHEMA_URL ? { $id: OPENPX_CONFIG_SCHEMA_URL } : {}),
  title: "OpenPX Config v1",
  description: "OpenPX v1 layered configuration schema.",
  ...generatedSchema,
  examples: [
    {
      ...(OPENPX_CONFIG_SCHEMA_URL ? { $schema: OPENPX_CONFIG_SCHEMA_URL } : {}),
      provider: {
        openai: {
          baseURL: "https://api.openai.com/v1",
          apiKey: "sk-...",
        },
      },
      model: {
        default: {
          provider: "openai",
          name: "gpt-5.4",
        },
        small: {
          provider: "openai",
          name: "gpt-5-mini",
        },
      },
      ui: {
        tui: DEFAULT_TUI_UI_CONFIG,
      },
    },
  ],
} as const;

export type OpenPXConfigSchema = z.infer<typeof openPXConfigSchema>;
