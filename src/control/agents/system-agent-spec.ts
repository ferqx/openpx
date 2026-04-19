/** system agent 标识。只服务系统内部维护，不直接作为用户工作对象。 */
export type SystemAgentId =
  | "compaction"
  | "summary"
  | "title"
  | "memory_maintainer";

/** system agent 规格。 */
export type SystemAgentSpec = {
  id: SystemAgentId;
  label: string;
  description: string;
};

export const SYSTEM_AGENT_SPECS: readonly SystemAgentSpec[] = [
  {
    id: "compaction",
    label: "Compaction",
    description: "负责线程压缩与上下文收束。",
  },
  {
    id: "summary",
    label: "Summary",
    description: "负责系统摘要与阶段性总结。",
  },
  {
    id: "title",
    label: "Title",
    description: "负责标题生成与线程命名。",
  },
  {
    id: "memory_maintainer",
    label: "MemoryMaintainer",
    description: "负责长期记忆维护与回填。",
  },
];
