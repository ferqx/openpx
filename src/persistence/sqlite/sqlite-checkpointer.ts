import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  TASKS,
  WRITES_IDX_MAP,
  copyCheckpoint,
  maxChannelVersion,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { Database } from "bun:sqlite";
import { createSqlite } from "./sqlite-client";
import type { CheckpointPort } from "../ports/checkpoint-port";

type CheckpointRow = {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  type: string | null;
  checkpoint: Uint8Array | null;
  metadata: Uint8Array | null;
};

type WriteRow = {
  task_id: string;
  idx: number;
  channel: string;
  type: string | null;
  value: Uint8Array | null;
};

class BunSqliteSaver extends BaseCheckpointSaver {
  private readonly db: Database;
  private isSetup = false;

  constructor(path: string) {
    super();
    this.db = createSqlite(path);
  }

  private setup() {
    if (this.isSetup) {
      return;
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint BLOB,
        metadata BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        value BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      )
    `);
    this.isSetup = true;
  }

  private async loadPendingWrites(threadId: string, checkpointNs: string, checkpointId: string) {
    const rows = this.db
      .query<WriteRow, [string, string, string]>(
        `SELECT task_id, idx, channel, type, value
         FROM writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY idx ASC`,
      )
      .all(threadId, checkpointNs, checkpointId);

    return Promise.all(
      rows.map(async (row) => {
        const value = await this.serde.loadsTyped(row.type ?? "json", row.value ?? new Uint8Array());
        return [row.task_id, row.channel, value] as [string, string, unknown];
      }),
    );
  }

  private async migratePendingSends(checkpoint: Checkpoint, threadId: string, checkpointNs: string, parentCheckpointId: string) {
    const rows = this.db
      .query<WriteRow, [string, string, string, string]>(
        `SELECT task_id, idx, channel, type, value
         FROM writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? AND channel = ?
         ORDER BY idx ASC`,
      )
      .all(threadId, checkpointNs, parentCheckpointId, TASKS);

    const pendingSends = await Promise.all(
      rows.map((row) => this.serde.loadsTyped(row.type ?? "json", row.value ?? new Uint8Array())),
    );

    checkpoint.channel_values[TASKS] = pendingSends;
    checkpoint.channel_versions[TASKS] =
      Object.keys(checkpoint.channel_versions).length > 0
        ? maxChannelVersion(...Object.values(checkpoint.channel_versions))
        : this.getNextVersion(undefined);
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    this.setup();

    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id;
    if (!threadId) {
      return undefined;
    }

    const row = checkpointId
      ? this.db
          .query<CheckpointRow, [string, string, string]>(
            `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
             FROM checkpoints
             WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`,
          )
          .get(threadId, checkpointNs, checkpointId)
      : this.db
          .query<CheckpointRow, [string, string]>(
            `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata
             FROM checkpoints
             WHERE thread_id = ? AND checkpoint_ns = ?
             ORDER BY checkpoint_id DESC
             LIMIT 1`,
          )
          .get(threadId, checkpointNs);

    if (!row) {
      return undefined;
    }

    const checkpoint = await this.serde.loadsTyped(row.type ?? "json", row.checkpoint ?? new Uint8Array());
    if (checkpoint.v < 4 && row.parent_checkpoint_id) {
      await this.migratePendingSends(checkpoint, row.thread_id, row.checkpoint_ns, row.parent_checkpoint_id);
    }

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint,
      metadata: await this.serde.loadsTyped(row.type ?? "json", row.metadata ?? new Uint8Array()),
      pendingWrites: await this.loadPendingWrites(row.thread_id, row.checkpoint_ns, row.checkpoint_id),
    };

    if (row.parent_checkpoint_id) {
      tuple.parentConfig = {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.parent_checkpoint_id,
        },
      };
    }

    return tuple;
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    this.setup();

    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns;
    const checkpointId = options?.before?.configurable?.checkpoint_id;
    let sql = `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata FROM checkpoints`;
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (threadId) {
      clauses.push("thread_id = ?");
      params.push(threadId);
    }
    if (checkpointNs !== undefined) {
      clauses.push("checkpoint_ns = ?");
      params.push(checkpointNs);
    }
    if (checkpointId) {
      clauses.push("checkpoint_id < ?");
      params.push(checkpointId);
    }
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY checkpoint_id DESC";
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    const rows = this.db.query<CheckpointRow, Array<string | number>>(sql).all(...params);
    for (const row of rows) {
      const checkpoint = await this.serde.loadsTyped(row.type ?? "json", row.checkpoint ?? new Uint8Array());
      if (checkpoint.v < 4 && row.parent_checkpoint_id) {
        await this.migratePendingSends(checkpoint, row.thread_id, row.checkpoint_ns, row.parent_checkpoint_id);
      }

      yield {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint,
        metadata: await this.serde.loadsTyped(row.type ?? "json", row.metadata ?? new Uint8Array()),
        parentConfig: row.parent_checkpoint_id
          ? {
              configurable: {
                thread_id: row.thread_id,
                checkpoint_ns: row.checkpoint_ns,
                checkpoint_id: row.parent_checkpoint_id,
              },
            }
          : undefined,
        pendingWrites: await this.loadPendingWrites(row.thread_id, row.checkpoint_ns, row.checkpoint_id),
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    this.setup();

    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    if (!threadId) {
      throw new Error('Missing "thread_id" field in passed "config.configurable".');
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const [[checkpointType, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(preparedCheckpoint),
      this.serde.dumpsTyped(metadata),
    ]);

    this.db.run(
      `INSERT OR REPLACE INTO checkpoints
       (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        threadId,
        checkpointNs,
        checkpoint.id,
        config.configurable?.checkpoint_id ?? null,
        checkpointType,
        serializedCheckpoint,
        serializedMetadata,
      ],
    );

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    this.setup();

    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id;
    if (!threadId) {
      throw new Error('Missing "thread_id" field in passed "config.configurable".');
    }
    if (!checkpointId) {
      throw new Error('Missing "checkpoint_id" field in passed "config.configurable".');
    }

    for (const [index, [channel, value]] of writes.entries()) {
      const [valueType, serializedValue] = await this.serde.dumpsTyped(value);
      const writeIndex = WRITES_IDX_MAP[channel] ?? index;
      const statement =
        writeIndex >= 0
          ? `INSERT OR IGNORE INTO writes
             (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          : `INSERT OR REPLACE INTO writes
             (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(statement, [
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        writeIndex,
        channel,
        valueType,
        serializedValue,
      ]);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    this.setup();
    this.db.run("DELETE FROM writes WHERE thread_id = ?", [threadId]);
    this.db.run("DELETE FROM checkpoints WHERE thread_id = ?", [threadId]);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function createSqliteCheckpointer(connString: string): CheckpointPort {
  return new BunSqliteSaver(connString);
}
