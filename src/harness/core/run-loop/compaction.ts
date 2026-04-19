import { compactThreadView } from "../../../control/context/thread-compaction-policy";
import type { DerivedThreadView } from "../../../control/context/thread-compaction-types";

/** run-loop compaction：把协作线投影视图压缩为可恢复的 durable view。 */
export function compactRunLoopThreadView(view: DerivedThreadView, trigger: "soft" | "boundary" | "hard") {
  return compactThreadView(view, { trigger });
}
