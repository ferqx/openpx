/**
 * @module harness/core/run/session-background-runner
 * harness 会话后台运行器（session background runner）。
 *
 * 它封装后台控制动作的统一完成与失败收口逻辑，
 * 让 session kernel 可以用稳定方式触发异步推进。
 */
/** 判断错误是否表示取消。 */
function isCancelledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  return "kind" in error && error.kind === "cancelled_error";
}

/** 在后台运行会话推进任务。 */
export async function runSessionInBackground<TResult>(input: {
  threadId: string;
  execute: () => Promise<TResult>;
  finalize: (result: TResult) => Promise<void>;
  publishFailure: (threadId: string, errorMessage: string) => void;
}): Promise<void> {
  try {
    const result = await input.execute();
    await input.finalize(result);
  } catch (error: unknown) {
    if (isCancelledError(error)) {
      return;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    input.publishFailure(input.threadId, errorMessage);
  }
}
