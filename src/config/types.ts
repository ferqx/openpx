/** 配置层级名称。 */
export type ResolvedConfigLayerName = "user" | "project" | "project-local";

/** provider 定义配置。 */
export type ProviderDefinitionConfig = {
  displayName?: string;
  baseURL?: string;
  apiKey?: string;
  supportsStreaming?: boolean;
  supportsJsonMode?: boolean;
  supportsUsageFields?: boolean;
  unsupportedParams?: string[];
  notes?: string;
};

/** provider 顶层配置：key 即 providerId。 */
export type ProviderConfig = Record<string, ProviderDefinitionConfig>;

/** 模型引用配置。 */
export type ModelRefConfig = {
  provider?: string;
  name?: string;
};

/** 模型槽位配置。 */
export type ModelConfig = {
  default?: ModelRefConfig | null;
  /** small 可选；缺省或显式清空时，运行时回落到 default。 */
  small?: ModelRefConfig | null;
};

/** 思考级别。 */
export type ThinkingLevel = "high" | "medium" | "low" | "off";

/** 运行时策略配置。 */
export type RuntimePolicyConfig = {
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
  chunkTimeoutMs?: number;
  maxRetries?: number;
  enableTelemetry?: boolean;
  enableCostTracking?: boolean;
  compactionPolicy?: string;
  workingSetPolicy?: string;
};

/** 默认 agent 配置。 */
export type AgentConfig = {
  defaultAgent?: string;
  enablePlanner?: boolean;
  enableVerifier?: boolean;
  enableScout?: boolean;
  enableSkills?: boolean;
  maxSubagents?: number;
  defaultMode?: string;
};

/** 权限模式。 */
export type PermissionMode = "guarded" | "full_access";

/** 权限配置。 */
export type PermissionConfig = {
  defaultMode?: PermissionMode;
  allow?: string[];
  ask?: string[];
  deny?: string[];
  additionalDirectories?: string[];
  disableBypassMode?: boolean;
};

/** skills 系统配置。 */
export type SkillsConfig = {
  enabled?: boolean;
  autoload?: boolean;
  directories?: string[];
  allowlist?: string[];
  denylist?: string[];
  maxLoaded?: number;
};

/** TUI 专属设置。 */
export type TuiUIConfig = {
  autoCompact: boolean;
  showTips: boolean;
  reduceMotion: boolean;
  thinkingMode: boolean;
  fastMode: boolean;
  promptSuggestions: boolean;
  rewindCode: boolean;
  verboseOutput: boolean;
  terminalProgressBar: boolean;
};

/** TUI 设置键集合。 */
export type TuiUIConfigKey = keyof TuiUIConfig;

/** 默认 TUI 设置。 */
export const DEFAULT_TUI_UI_CONFIG: TuiUIConfig = {
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

/** TUI 设置键列表。 */
export const TUI_UI_KEYS = Object.keys(DEFAULT_TUI_UI_CONFIG) as TuiUIConfigKey[];

/** UI 顶层配置。 */
export type UIConfig = {
  theme?: string;
  showCost?: boolean;
  showTurnDuration?: boolean;
  showLoopEvents?: boolean;
  editorMode?: string;
  tui?: Partial<TuiUIConfig>;
};

/** 主配置文件结构。 */
export type OpenPXConfig = {
  $schema?: string;
  provider?: ProviderConfig;
  model?: ModelConfig;
  runtime?: RuntimePolicyConfig;
  agent?: AgentConfig;
  permission?: PermissionConfig;
  skills?: SkillsConfig;
  ui?: UIConfig;
};

/** capability 目录索引。 */
export type ResolvedConfigInventory = {
  agents: string[];
  skills: string[];
  tools: string[];
};

/** 单层配置的解析结果。 */
export type ResolvedConfigLayer = {
  name: ResolvedConfigLayerName;
  path: string;
  exists: boolean;
  config?: OpenPXConfig;
};

/** 配置解析结果。 */
export type ResolvedOpenPXConfig = {
  config: OpenPXConfig;
  layers: ResolvedConfigLayer[];
  inventory: ResolvedConfigInventory;
  envFallback: boolean;
};

/** 默认主配置。 */
export const DEFAULT_OPENPX_CONFIG: OpenPXConfig = {
  provider: {},
  runtime: {
    timeoutMs: 120_000,
    chunkTimeoutMs: 30_000,
    maxRetries: 1,
    enableTelemetry: true,
    enableCostTracking: true,
  },
  agent: {
    enablePlanner: true,
    enableVerifier: true,
    enableScout: false,
    enableSkills: true,
    maxSubagents: 0,
  },
  permission: {
    defaultMode: "guarded",
    allow: [],
    ask: [],
    deny: [],
    additionalDirectories: [],
    disableBypassMode: false,
  },
  skills: {
    enabled: true,
    autoload: true,
    directories: [],
    allowlist: [],
    denylist: [],
    maxLoaded: 64,
  },
  ui: {
    theme: "default",
    showCost: true,
    showTurnDuration: true,
    showLoopEvents: false,
    editorMode: "default",
    tui: DEFAULT_TUI_UI_CONFIG,
  },
};
