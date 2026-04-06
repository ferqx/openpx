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

describe("smokePlanner", () => {
  afterEach(() => {
    createAppContextMock.mockClear();
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
                  error: "missing OPENAI_API_KEY",
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
    ).rejects.toThrow("missing OPENAI_API_KEY");
  });

  test("annotates connection failures with model configuration details", async () => {
    const failingCreateAppContextMock = mock(async () => ({
      config: {
        model: {
          name: "gpt-5.4",
          baseURL: "https://gateway.example.test/v1",
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

});
