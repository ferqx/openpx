import { createAppContext } from "./bootstrap";
import { lookup } from "node:dns/promises";
import { Socket } from "node:net";
import { createModelGateway, type ModelGateway } from "../infra/model-gateway";
import { resolveConfig } from "../shared/config";

/** smoke planner 命令返回的最小结果形状 */
type SmokePlannerCommandResult = {
  summary?: string;
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
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

type SmokePlannerCreateGateway = (input: {
  workspaceRoot: string;
  dataDir: string;
}) => Pick<ModelGateway, "plan">;

/** 线程视图事件中 smoke planner 真正关心的字段 */
type SessionEventPayload = {
  threadId: string;
  status?: string;
  summary?: string;
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  error?: string;
};

const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;
const SMOKE_PLANNER_PROMPT = "plan the next improvements for this agent OS TUI and control plane";
const LOCAL_PROXY_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** 校验事件 payload 是否具备线程级摘要/错误信息 */
function isSessionEventPayload(payload: unknown): payload is SessionEventPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return typeof candidate.threadId === "string";
}

function extractSmokeSummary(payload: {
  summary?: string;
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
}): string | undefined {
  return payload.summary
    ?? payload.finalResponse
    ?? payload.executionSummary
    ?? payload.verificationSummary
    ?? payload.pauseSummary;
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

      const summary = extractSmokeSummary(event.payload);
      if (!summary) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe();
      resolve(summary);
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

/** 解析当前生效的代理地址，优先 https，再回退 http/all_proxy。 */
function resolveConfiguredProxy(): string | undefined {
  return process.env.https_proxy
    ?? process.env.http_proxy
    ?? process.env.HTTPS_PROXY
    ?? process.env.HTTP_PROXY
    ?? process.env.all_proxy
    ?? process.env.ALL_PROXY;
}

/** 判断代理是否是本机代理；只有这种情况才做“端口未启动”的快速预检。 */
function isLocalProxy(proxyUrl: string): boolean {
  try {
    const parsed = new URL(proxyUrl);
    return LOCAL_PROXY_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

async function defaultCheckProxyReachable(proxyUrl: string, timeoutMs = 300): Promise<boolean> {
  try {
    const parsed = new URL(proxyUrl);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    if (!parsed.hostname || Number.isNaN(port)) {
      return false;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeoutMs);
      socket.once("connect", () => {
        cleanup();
        resolve();
      });
      socket.once("timeout", () => {
        cleanup();
        reject(new Error("proxy timeout"));
      });
      socket.once("error", (error) => {
        cleanup();
        reject(error);
      });
      socket.connect(port, parsed.hostname);
    });
    return true;
  } catch {
    return false;
  }
}

async function defaultResolveHostReachable(baseURL: string | undefined): Promise<boolean | undefined> {
  if (!baseURL) {
    return undefined;
  }

  try {
    const parsed = new URL(baseURL);
    await lookup(parsed.hostname);
    return true;
  } catch {
    return false;
  }
}

async function withProxyTemporarilyDisabled<T>(run: () => Promise<T>): Promise<T> {
  const previous = {
    http_proxy: process.env.http_proxy,
    https_proxy: process.env.https_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    all_proxy: process.env.all_proxy,
    ALL_PROXY: process.env.ALL_PROXY,
  };

  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.all_proxy;
  delete process.env.ALL_PROXY;

  try {
    return await run();
  } finally {
    process.env.http_proxy = previous.http_proxy;
    process.env.https_proxy = previous.https_proxy;
    process.env.HTTP_PROXY = previous.HTTP_PROXY;
    process.env.HTTPS_PROXY = previous.HTTPS_PROXY;
    process.env.all_proxy = previous.all_proxy;
    process.env.ALL_PROXY = previous.ALL_PROXY;
  }
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
  const configuredProxy = resolveConfiguredProxy();
  const result = await ctx.kernel.handleCommand({
    type: "submit_input",
    payload: {
      text: SMOKE_PLANNER_PROMPT,
    },
  });

  return (
    extractSmokeSummary(result) ??
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
    createGateway?: SmokePlannerCreateGateway;
    timeoutMs?: number;
    checkProxyReachable?: (proxyUrl: string) => Promise<boolean>;
    resolveHostReachable?: (baseURL: string | undefined) => Promise<boolean | undefined>;
  },
) {
  if (deps?.createGateway) {
    const gateway = deps.createGateway({
      workspaceRoot: input?.workspaceRoot ?? process.cwd(),
      dataDir: input?.dataDir ?? process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ":memory:",
    });
    const result = await gateway.plan({
      prompt: SMOKE_PLANNER_PROMPT,
    });
    console.log(result.summary);
    return;
  }

  if (!deps?.createContext) {
    const config = resolveConfig({
      workspaceRoot: input?.workspaceRoot ?? process.cwd(),
      dataDir: input?.dataDir ?? process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ":memory:",
    });
    const gateway = createModelGateway({
      apiKey: config.model.apiKey,
      baseURL: config.model.baseURL,
      modelName: config.model.name,
      timeoutMs: deps?.timeoutMs,
    });
    const result = await gateway.plan({
      prompt: SMOKE_PLANNER_PROMPT,
    });
    console.log(result.summary);
    return;
  }

  const createContext: SmokePlannerCreateContext = deps?.createContext ?? createAppContext;
  const configuredProxy = resolveConfiguredProxy();
  const checkProxyReachable = deps?.checkProxyReachable ?? defaultCheckProxyReachable;
  const resolveHostReachable = deps?.resolveHostReachable ?? defaultResolveHostReachable;

  try {
    const summary = await runSmokeAttempt(createContext, input, deps?.timeoutMs);
    console.log(summary);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      configuredProxy
      && isLocalProxy(configuredProxy)
      && message.includes("Connection error.")
      && !(await checkProxyReachable(configuredProxy))
    ) {
      try {
        const summary = await withProxyTemporarilyDisabled(() =>
          runSmokeAttempt(createContext, input, deps?.timeoutMs),
        );
        console.log(summary);
        return;
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        const hostReachable = await resolveHostReachable(process.env.OPENAI_BASE_URL);
        throw new Error(
          [
            `Configured local proxy is unreachable: ${configuredProxy}.`,
            `Retried planner smoke without proxy but still failed: ${retryMessage}`,
            hostReachable === false ? "DNS lookup failed for model host." : undefined,
            "Start the local proxy or provide a directly reachable OPENAI_BASE_URL.",
            hostReachable === false ? `Current OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL ?? "unset"}.` : undefined,
          ].join(" "),
        );
      }
    }
    throw error;
  }
}

if (import.meta.main) {
  await smokePlanner();
}
