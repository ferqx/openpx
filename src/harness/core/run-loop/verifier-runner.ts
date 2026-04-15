import type { RunLoopState } from "./step-types";

/** verifier runner：把 verifier 处理器结果对齐到 run-loop 验证报告。 */
export function createVerifierRunner(handler: (state: RunLoopState) => Promise<Partial<RunLoopState>> | Partial<RunLoopState>) {
  return async (state: RunLoopState): Promise<Partial<RunLoopState>> => {
    const result = await handler(state);
    return {
      ...result,
      nextStep: result.nextStep ?? "respond",
    };
  };
}
