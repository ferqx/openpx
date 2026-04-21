import { z } from "zod";

/** 线程模式：描述 Build 这个主代理在当前 thread 内的工作方式。 */
export const threadModeSchema = z.enum(["normal", "plan"]);

/** 线程模式类型。 */
export type ThreadMode = z.infer<typeof threadModeSchema>;

/** v1 默认线程模式固定为 normal。 */
export const DEFAULT_THREAD_MODE: ThreadMode = "normal";

/** 判断是否为计划模式，供 run-loop / TUI 投影复用。 */
export function isPlanThreadMode(mode: ThreadMode | undefined): mode is "plan" {
  return mode === "plan";
}

/** 缺失模式时统一回填默认值，避免各层散落硬编码。 */
export function normalizeThreadMode(mode: ThreadMode | undefined): ThreadMode {
  return mode ?? DEFAULT_THREAD_MODE;
}
