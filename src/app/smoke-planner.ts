import { createAppContext } from "./bootstrap";

/** smoke planner 命令返回的最小结果形状 */
type SmokePlannerCommandResult = {
  summary?: string;
  threadId: string;
};

/** smoke planner 监听的最小事件形状 */
type SmokePlannerEvent = {
  type: string;
  payload?: unknown;
};

/** smoke planner 依赖的最小 kernel 接口 */
type SmokePlannerKernel = {
  handleCommand: (
    command: {
      type: "submit_input";
      payload: {
        text: string;
      };
    },
  ) => Promise<SmokePlannerCommandResult>;
  events: {
    subscribe: (handler: (event: SmokePlannerEvent) => void) => () => void;
  };
};

/** 允许测试注入 createContext，避免依赖真实 bootstrap */
type SmokePlannerCreateContext = (input: {
  workspaceRoot: string;
  dataDir: string;
}) => Promise<{
  config?: {
    model?: {
      name?: string;
      baseURL?: string;
    };
  };
  kernel: SmokePlannerKernel;
}>;

/** 线程视图事件中 smoke planner 真正关心的字段 */
type SessionEventPayload = {
  threadId: string;
  status?: string;
  summary?: string;
  error?: string;
};

const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;
const SMOKE_PLANNER_PROMPT = "plan the next improvements for this agent OS TUI and control plane";

/** 校验事件 payload 是否具备线程级摘要/错误信息 */
function isSessionEventPayload(payload: unknown): payload is SessionEventPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return typeof candidate.threadId === "string";
}

/** 等待 planner 摘要完成；若 task.failed 先到，则立即失败 */
function waitForPlannerSummary(
  kernel: SmokePlannerKernel,
  threadId: string,
  timeoutMs = DEFAULT_SMOKE_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`planner smoke timed out for thread ${threadId}`));
    }, timeoutMs);

    const unsubscribe = kernel.events.subscribe((event) => {
      if (event.type === "task.failed" && isSessionEventPayload(event.payload) && event.payload.threadId === threadId) {
        clearTimeout(timeout);
        unsubscribe();
        reject(new Error(event.payload.error ?? event.payload.summary ?? `planner smoke failed for thread ${threadId}`));
        return;
      }

      if (event.type !== "thread.view_updated" || !isSessionEventPayload(event.payload) || event.payload.threadId !== threadId) {
        return;
      }

      if (!event.payload.summary) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe();
      resolve(event.payload.summary);
    });
  });
}

/** 在连接失败场景补充模型与代理信息，方便诊断 */
function formatSmokeFailure(errorMessage: string, context?: {
  modelName?: string;
  baseURL?: string;
  proxy?: string;
}): string {
  if (errorMessage !== "Connection error.") {
    return errorMessage;
  }

  const suffix = [
    context?.modelName ? `model=${context.modelName}` : undefined,
    context?.baseURL ? `baseURL=${context.baseURL}` : undefined,
    context?.proxy ? `proxy=${context.proxy}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return suffix ? `${errorMessage} ${suffix}` : errorMessage;
}

/** 执行一次 smoke planner：提交 prompt，然后等待即时摘要或异步 thread 更新 */
async function runSmokeAttempt(
  createContext: SmokePlannerCreateContext,
  input: { workspaceRoot?: string; dataDir?: string } | undefined,
  timeoutMs: number | undefined,
): Promise<string> {
  const ctx = await createContext({
    workspaceRoot: input?.workspaceRoot ?? process.cwd(),
    dataDir: input?.dataDir ?? process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ":memory:",
  });
  const configuredProxy = process.env.https_proxy ?? process.env.http_proxy ?? process.env.all_proxy;
  const result = await ctx.kernel.handleCommand({
    type: "submit_input",
    payload: {
      text: SMOKE_PLANNER_PROMPT,
    },
  });

  return (
    result.summary ??
    (await waitForPlannerSummary(
      {
        ...ctx.kernel,
        events: {
          subscribe(handler) {
            return ctx.kernel.events.subscribe((event) => {
              if (
                event.type === "task.failed" &&
                isSessionEventPayload(event.payload) &&
                event.payload.threadId === result.threadId &&
                event.payload.error
              ) {
                // 在 waitForPlannerSummary 收到失败前先改写错误文案，
                // 让 CLI 直接输出可诊断的连接信息。
                handler({
                  ...event,
                  payload: {
                    ...event.payload,
                    error: formatSmokeFailure(event.payload.error, {
                      modelName: ctx.config?.model?.name,
                      baseURL: ctx.config?.model?.baseURL,
                      proxy: configuredProxy,
                    }),
                  },
                });
                return;
              }

              handler(event);
            });
          },
        },
      },
      result.threadId,
      timeoutMs,
    ))
  );
}

/** 对外 smoke 入口：打印最终 planner 摘要到 stdout */
export async function smokePlanner(
  input?: { workspaceRoot?: string; dataDir?: string },
  deps?: {
    createContext?: SmokePlannerCreateContext;
    timeoutMs?: number;
  },
) {
  const createContext: SmokePlannerCreateContext = deps?.createContext ?? createAppContext;
  const summary = await runSmokeAttempt(createContext, input, deps?.timeoutMs);
  console.log(summary);
}

if (import.meta.main) {
  await smokePlanner();
}
