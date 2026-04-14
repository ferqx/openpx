/** 
 * @module kernel/session-background-runner
 * 会话后台运行器（session background runner）。
 * 
 * 在后台执行会话任务，提供统一的错误处理和取消检测。
 * 被 session-kernel 用于在后台推进 run 的执行，
 * 确保异常和取消信号被正确处理。
 * 
 * 术语对照：session=会话，background=后台，cancel=取消
 */
/** 判断错误是否为取消信号（AbortError 或自定义 cancelled_error） */
function isCancelledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {  // 标准 AbortController 产生的取消错误
    return true;
  }

  return "kind" in error && error.kind === "cancelled_error";  // 自定义取消错误标记
}

/** 在后台运行会话任务，处理成功回调和失败发布 */
export async function runSessionInBackground<TResult>(input: {
  threadId: string;                    // 协作线标识
  execute: () => Promise<TResult>;      // 执行函数
  finalize: (result: TResult) => Promise<void>;  // 成功后的回调
  publishFailure: (threadId: string, errorMessage: string) => void;  // 失败时发布错误事件
}): Promise<void> {
  try {
    const result = await input.execute();   // 执行会话任务
    await input.finalize(result);            // 成功后执行回调
  } catch (error: unknown) {
    if (isCancelledError(error)) {            // 取消错误静默处理
      return;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);  // 提取错误信息
    input.publishFailure(input.threadId, errorMessage);
  }
}
