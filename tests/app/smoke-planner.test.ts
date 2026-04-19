import { afterEach, describe, expect, mock, test } from "bun:test";
import { smokePlanner } from "../../src/app/smoke-planner";

const createAppContextMock = mock(async () => ({
  kernel: {
    async handleCommand() {
      return {
        threadId: "thread-smoke",
        status: "active" as const,
      };
    },
    events: {
      subscribe(handler: (event: { type: string; payload?: unknown }) => void) {
        queueMicrotask(() => {
          handler({
            type: "thread.view_updated",
            payload: {
              threadId: "thread-smoke",
              status: "completed",
              summary: "Planned repo cleanup",
            },
          });
        });
        return () => {};
      },
    },
  },
}));

const createModelGatewayMock = mock(() => ({
  async plan() {
    return {
      summary: "Direct planner smoke summary",
    };
  },
}));

describe("smokePlanner", () => {
  afterEach(() => {
    createAppContextMock.mockClear();
    createModelGatewayMock.mockClear();
  });

  test("uses a direct planner gateway when provided", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((value: unknown) => {
      logs.push(String(value));
    });

    try {
      await smokePlanner(
        {
          workspaceRoot: "/tmp/openpx-smoke",
          dataDir: ":memory:",
        },
        {
          createGateway: createModelGatewayMock,
        },
      );
    } finally {
      console.log = originalLog;
    }

    expect(createModelGatewayMock).toHaveBeenCalledTimes(1);
    expect(createAppContextMock).toHaveBeenCalledTimes(0);
    expect(logs).toContain("Direct planner smoke summary");
  });

  test("prints the final planner summary from the stable kernel event stream", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((value: unknown) => {
      logs.push(String(value));
    });

    try {
      await smokePlanner({
        workspaceRoot: "/tmp/openpx-smoke",
        dataDir: ":memory:",
      }, {
        createContext: createAppContextMock,
        timeoutMs: 100,
      });
    } finally {
      console.log = originalLog;
    }

    expect(createAppContextMock).toHaveBeenCalledTimes(1);
    expect(logs).toContain("Planned repo cleanup");
  });

  test("accepts finalResponse from thread view updates instead of requiring legacy summary", async () => {
    const createContextWithFinalResponse = mock(async () => ({
      kernel: {
        async handleCommand() {
          return {
            threadId: "thread-smoke-final-response",
            status: "active" as const,
          };
        },
        events: {
          subscribe(handler: (event: { type: string; payload?: unknown }) => void) {
            queueMicrotask(() => {
              handler({
                type: "thread.view_updated",
                payload: {
                  threadId: "thread-smoke-final-response",
                  status: "completed",
                  finalResponse: "Planned repo cleanup via final response",
                },
              });
            });
            return () => {};
          },
        },
      },
    }));

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((value: unknown) => {
      logs.push(String(value));
    });

    try {
      await smokePlanner(
        {
          workspaceRoot: "/tmp/openpx-smoke",
          dataDir: ":memory:",
        },
        {
          createContext: createContextWithFinalResponse,
          timeoutMs: 100,
        },
      );
    } finally {
      console.log = originalLog;
    }

    expect(logs).toContain("Planned repo cleanup via final response");
  });

  test("surfaces task failure details from the kernel event stream", async () => {
    const failingCreateAppContextMock = mock(async () => ({
      kernel: {
        async handleCommand() {
          return {
            threadId: "thread-smoke-failed",
            status: "active" as const,
          };
        },
        events: {
          subscribe(handler: (event: { type: string; payload?: unknown }) => void) {
            queueMicrotask(() => {
              handler({
                type: "task.failed",
                payload: {
                  threadId: "thread-smoke-failed",
                  error: "missing apiKey for provider openai",
                },
              });
            });
            return () => {};
          },
        },
      },
    }));

    await expect(
      smokePlanner(
        {
          workspaceRoot: "/tmp/openpx-smoke",
          dataDir: ":memory:",
        },
        {
          createContext: failingCreateAppContextMock,
          timeoutMs: 100,
        },
      ),
    ).rejects.toThrow("missing apiKey for provider openai");
  });

  test("annotates connection failures with model configuration details", async () => {
    const failingCreateAppContextMock = mock(async () => ({
      config: {
        model: {
          default: {
            name: "gpt-5.4",
            provider: {
              profile: {
                baseURL: "https://gateway.example.test/v1",
              },
            },
          },
        },
      },
      kernel: {
        async handleCommand() {
          return {
            threadId: "thread-smoke-network-failed",
            status: "active" as const,
          };
        },
        events: {
          subscribe(handler: (event: { type: string; payload?: unknown }) => void) {
            queueMicrotask(() => {
              handler({
                type: "task.failed",
                payload: {
                  threadId: "thread-smoke-network-failed",
                  error: "Connection error.",
                },
              });
            });
            return () => {};
          },
        },
      },
    }));

    await expect(
      smokePlanner(
        {
          workspaceRoot: "/tmp/openpx-smoke",
          dataDir: ":memory:",
        },
        {
          createContext: failingCreateAppContextMock,
          timeoutMs: 100,
        },
      ),
    ).rejects.toThrow("Connection error. model=gpt-5.4 baseURL=https://gateway.example.test/v1");
  });

  test("retries once without a dead local proxy before failing the smoke run", async () => {
    const originalHttpProxy = process.env.http_proxy;
    const originalHttpsProxy = process.env.https_proxy;
    process.env.http_proxy = "http://127.0.0.1:7890";
    process.env.https_proxy = "http://127.0.0.1:7890";

    const retryingCreateAppContextMock = mock(async () => ({
      kernel: {
        async handleCommand() {
          if (process.env.http_proxy || process.env.https_proxy) {
            return {
              threadId: "thread-smoke-retry",
              status: "active" as const,
            };
          }

          return {
            threadId: "thread-smoke-retry",
            status: "completed" as const,
            summary: "Recovered planner smoke after bypassing dead proxy",
          };
        },
        events: {
          subscribe(handler: (event: { type: string; payload?: unknown }) => void) {
            if (process.env.http_proxy || process.env.https_proxy) {
              queueMicrotask(() => {
                handler({
                  type: "task.failed",
                  payload: {
                    threadId: "thread-smoke-retry",
                    error: "Connection error.",
                  },
                });
              });
            }
            return () => {};
          },
        },
      },
      config: {
        model: {
          default: {
            name: "gpt-5.4",
            provider: {
              profile: {
                baseURL: "https://gateway.example.test/v1",
              },
            },
          },
        },
      },
    }));

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((value: unknown) => {
      logs.push(String(value));
    });

    try {
      await smokePlanner(
        {
          workspaceRoot: "/tmp/openpx-smoke",
          dataDir: ":memory:",
        },
        {
          createContext: retryingCreateAppContextMock,
          timeoutMs: 100,
          checkProxyReachable: async () => false,
        },
      );
    } finally {
      console.log = originalLog;
      process.env.http_proxy = originalHttpProxy;
      process.env.https_proxy = originalHttpsProxy;
    }

    expect(retryingCreateAppContextMock).toHaveBeenCalledTimes(2);
    expect(logs).toContain("Recovered planner smoke after bypassing dead proxy");
  });

  test("explains DNS failures after proxy fallback is exhausted", async () => {
    const originalHttpProxy = process.env.http_proxy;
    const originalHttpsProxy = process.env.https_proxy;
    process.env.http_proxy = "http://127.0.0.1:7890";
    process.env.https_proxy = "http://127.0.0.1:7890";

    const failingCreateAppContextMock = mock(async () => ({
      kernel: {
        async handleCommand() {
          return {
            threadId: "thread-smoke-dns-failed",
            status: "active" as const,
          };
        },
        events: {
          subscribe(handler: (event: { type: string; payload?: unknown }) => void) {
            queueMicrotask(() => {
              handler({
                type: "task.failed",
                payload: {
                  threadId: "thread-smoke-dns-failed",
                  error: "Connection error.",
                },
              });
            });
            return () => {};
          },
        },
      },
      config: {
        model: {
          default: {
            name: "DeepSeek-V3.2",
            provider: {
              profile: {
                baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
              },
            },
          },
        },
      },
    }));

    try {
      await expect(
        smokePlanner(
          {
            workspaceRoot: "/tmp/openpx-smoke",
            dataDir: ":memory:",
          },
          {
            createContext: failingCreateAppContextMock,
            timeoutMs: 100,
            checkProxyReachable: async () => false,
            resolveHostReachable: async () => false,
          },
        ),
      ).rejects.toThrow("DNS lookup failed for model host");
    } finally {
      process.env.http_proxy = originalHttpProxy;
      process.env.https_proxy = originalHttpsProxy;
    }
  });

});
