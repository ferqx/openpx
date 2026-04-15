import type { ResumeControl } from "../runtime/graph/root/resume-control";
import { resumeInputText } from "./control-plane-support";

/** graph bridge 输入：只保留 graph 入口路由所需的最小决策信息 */
type GraphBridgeInput = {
  inputValue: string | ResumeControl;
  isResume: boolean;
};

/** graph bridge 依赖：分别提供 fresh invoke 与 resume invoke 的调用面 */
type GraphBridgeDeps<TResult> = {
  invokeResume: (inputValue: ResumeControl) => Promise<TResult>;
  invokeFresh: (text: string) => Promise<TResult>;
};

// graph bridge 只负责把 control-plane 的生命周期语义翻译成
// “走 resume 还是走 fresh invoke” 这一层，不直接持有 graph 的复杂类型。
export async function invokeRootGraph<TResult>(
  deps: GraphBridgeDeps<TResult>,
  input: GraphBridgeInput,
): Promise<TResult> {
  if (input.isResume) {
    if (typeof input.inputValue === "string") {
      throw new Error("resume graph invocation requires structured resume input");
    }
    // resume 不能退回文本输入，否则会把“恢复执行”错误地当成“新任务”处理。
    return deps.invokeResume(input.inputValue);
  }

  return deps.invokeFresh(resumeInputText(input.inputValue));
}
