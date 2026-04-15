/** 
 * @module shared/id-generators
 * 带前缀的 UUID 生成器。
 * 
 * 使用 ULID 生成带前缀的唯一标识符，提供更好的可排序性和云同步就绪性。
 * 
 * 术语对照：ULID=可排序的唯一标识符，prefixedUuid=带前缀的 UUID
 */
import { ulid } from "ulid";

/** 生成带前缀的 ULID 标识符，格式为 "{prefix}_{ulid}" */
export function prefixedUuid(prefix: string): string {
  // 使用 ULID 以获得更好的可排序性和云同步就绪性
  return `${prefix}_${ulid()}`;
}
