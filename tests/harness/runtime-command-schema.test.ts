import { describe, expect, test } from "bun:test";
import { runtimeCommandSchema } from "../../src/harness/protocol/commands/runtime-command-schema";

describe("runtime command schema", () => {
  test("接受人工恢复公开命令", () => {
    expect(
      runtimeCommandSchema.parse({
        kind: "restart_run",
        threadId: "thread_1",
      }),
    ).toEqual({
      kind: "restart_run",
      threadId: "thread_1",
    });

    expect(
      runtimeCommandSchema.parse({
        kind: "abandon_run",
        threadId: "thread_1",
      }),
    ).toEqual({
      kind: "abandon_run",
      threadId: "thread_1",
    });
  });
});