import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

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
