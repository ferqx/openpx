import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database, type SQLQueryBindings, type Changes } from "bun:sqlite";

/** 创建 sqlite 连接；文件库会先确保目录存在，内存库直接创建 */
export function createSqlite(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  return new Database(path, { create: true });
}

/** 统一解析 sqlite 输入：字符串表示本函数拥有连接，Database 实例表示外部拥有 */
export function resolveSqlite(input: string | Database): { db: Database; owned: boolean } {
  if (typeof input === "string") {
    return { db: createSqlite(input), owned: true };
  }

  return { db: input, owned: false };
}

/** 统一关闭 sqlite 句柄：先尝试 checkpoint，尽量减少 Windows + WAL 的延迟锁。 */
type SqliteClosable = {
  run<ParamsType extends SQLQueryBindings[]>(sql: string, ...bindings: ParamsType[]): Changes;
  close(): void;
};

export function closeSqliteHandle(db: SqliteClosable): void {
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // 内存库或已关闭连接可能不支持 checkpoint，忽略即可。
  }

  try {
    db.run("PRAGMA optimize");
  } catch {
    // optimize 不是强约束；关闭前尽力执行即可。
  }

  db.close();
}
