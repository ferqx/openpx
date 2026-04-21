import { SUBAGENT_SPECS, type SubagentId, type SubagentSpec } from "./subagent-spec";

const subagentSpecMap = new Map<SubagentId, SubagentSpec>(
  SUBAGENT_SPECS.map((spec) => [spec.id, spec]),
);

/** 统一 subagent 注册表：供协议投影与后续实例化策略查询。 */
export function getSubagentSpec(id: SubagentId): SubagentSpec {
  const spec = subagentSpecMap.get(id);
  if (!spec) {
    throw new Error(`unknown subagent spec: ${id}`);
  }
  return spec;
}

/** 返回全部 subagent 规格。 */
export function listSubagentSpecs(): readonly SubagentSpec[] {
  return SUBAGENT_SPECS;
}
