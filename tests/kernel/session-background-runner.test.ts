import { describe, expect, mock, test } from "bun:test";
import { runSessionInBackground } from "../../src/kernel/session-background-runner";

describe("runSessionInBackground", () => {
  test("forwards successful results to finalize", async () => {
    const finalize = mock(async () => undefined);
    const publishFailure = mock(() => undefined);

    await runSessionInBackground({
      threadId: "thread-1",
      execute: async () => ({ summary: "done" }),
      finalize,
      publishFailure,
    });

    expect(finalize).toHaveBeenCalledTimes(1);
    expect(publishFailure).not.toHaveBeenCalled();
  });

  test("publishes failures instead of throwing", async () => {
    const finalize = mock(async () => undefined);
    const publishFailure = mock(() => undefined);

    await runSessionInBackground({
      threadId: "thread-1",
      execute: async () => {
        throw new Error("boom");
      },
      finalize,
      publishFailure,
    });

    expect(finalize).not.toHaveBeenCalled();
    expect(publishFailure).toHaveBeenCalledWith("thread-1", "boom");
  });

  test("suppresses cancelled executions without publishing a failure", async () => {
    const finalize = mock(async () => undefined);
    const publishFailure = mock(() => undefined);
    const cancelledError = new Error("cancelled");
    cancelledError.name = "AbortError";

    await runSessionInBackground({
      threadId: "thread-1",
      execute: async () => {
        throw cancelledError;
      },
      finalize,
      publishFailure,
    });

    expect(finalize).not.toHaveBeenCalled();
    expect(publishFailure).not.toHaveBeenCalled();
  });
});
