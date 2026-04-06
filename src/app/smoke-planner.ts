import { createAppContext } from "./bootstrap";

type SmokePlannerCommandResult = {
  summary?: string;
  threadId: string;
};

type SmokePlannerEvent = {
  type: string;
  payload?: unknown;
};

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

type SessionEventPayload = {
  threadId: string;
  status?: string;
  summary?: string;
  error?: string;
};

const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;
const SMOKE_PLANNER_PROMPT = "plan the next improvements for this agent OS TUI and control plane";

function isSessionEventPayload(payload: unknown): payload is SessionEventPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return typeof candidate.threadId === "string";
}

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
