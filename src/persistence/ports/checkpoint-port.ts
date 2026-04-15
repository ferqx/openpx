import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

/** checkpoint 端口：当前直接复用 LangGraph BaseCheckpointSaver 接口 */
export type CheckpointPort = BaseCheckpointSaver;
