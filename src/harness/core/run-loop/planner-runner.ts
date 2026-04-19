import type { RunLoopState } from "./step-types";

/** planner runner：把 planner 处理器对齐到 run-loop 的状态补丁形状。 */
export function createPlannerRunner(handler: (state: RunLoopState) => Promise<Partial<RunLoopState>> | Partial<RunLoopState>) {
  return async (state: RunLoopState): Promise<Partial<RunLoopState>> => {
    const result = await handler(state);
    return {
      ...result,
      nextStep: result.nextStep ?? "execute",
    };
  };
}
