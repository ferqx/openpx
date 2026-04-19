/** primary agent 标识。v1 当前只有 Build 一个正式主代理。 */
export type PrimaryAgentId = "build";

/** 主代理规格。 */
export type PrimaryAgentSpec = {
  id: PrimaryAgentId;
  label: string;
  description: string;
};

/** Build：唯一 primary agent。 */
export const BUILD_AGENT_SPEC: PrimaryAgentSpec = {
  id: "build",
  label: "Build",
  description: "默认主代理，负责 thread 内的正常执行与计划模式切换。",
};

/** v1 默认主代理。 */
export const DEFAULT_PRIMARY_AGENT_ID: PrimaryAgentId = BUILD_AGENT_SPEC.id;
