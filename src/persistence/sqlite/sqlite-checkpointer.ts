import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { CheckpointPort } from "../ports/checkpoint-port";

export function createSqliteCheckpointer(connString: string): CheckpointPort {
  return SqliteSaver.fromConnString(connString);
}
