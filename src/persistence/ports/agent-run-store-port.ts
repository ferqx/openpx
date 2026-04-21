import type { AgentRunRecord } from "../../domain/agent-run";
import type { StoragePort } from "./storage-port";

/** AgentRun 存储端口：保存运行实例，并支持按 thread 查询当前活跃实例。 */
export interface AgentRunStorePort extends StoragePort {
  save(agentRun: AgentRunRecord): Promise<void>;
  get(agentRunId: string): Promise<AgentRunRecord | undefined>;
  listByThread(threadId: string): Promise<AgentRunRecord[]>;
  listActiveByThread(threadId: string): Promise<AgentRunRecord[]>;
}
