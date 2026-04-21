import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteRunStateStore } from "../../src/persistence/sqlite/sqlite-run-state-store";
import { removeWithRetry } from "../helpers/fs-cleanup";

const tempDirs: string[] = [];
const stores: SqliteRunStateStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => removeWithRetry(dir, { recursive: true, force: true })));
});

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "openpx-run-state-"));
  tempDirs.push(dir);
  const store = new SqliteRunStateStore(join(dir, "openpx.db"));
  stores.push(store);
  return store;
}

describe("sqlite run state store", () => {
  test("保存并读取最新 run-loop state", async () => {
    const store = await createStore();
    await store.saveState({
      stateVersion: 1,
      engineVersion: "run-loop-v1",
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      input: "fix startup message",
      nextStep: "execute",
      currentWorkPackageId: "pkg_startup_message",
      workPackages: [
        {
          id: "pkg_startup_message",
          objective: "Update startup message",
          allowedTools: ["apply_patch"],
          inputRefs: ["thread:goal"],
          expectedArtifacts: ["patch:src/app/main.ts"],
        },
      ],
      artifacts: [],
      latestArtifacts: [],
    });

    const loaded = await store.loadLatestByThread("thread_1");
    expect(loaded?.runId).toBe("run_1");
    expect(loaded?.currentWorkPackageId).toBe("pkg_startup_message");
    expect(loaded?.stateVersion).toBe(1);
    expect(loaded?.engineVersion).toBe("run-loop-v1");
  });

  test("保存 suspension 与 continuation，并按状态机执行 CAS 解析", async () => {
    const store = await createStore();
    await store.saveSuspension({
      suspensionId: "suspension_1",
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      reasonKind: "waiting_approval",
      summary: "Approval required before deleting approved.txt",
      approvalRequestId: "approval_1",
      resumeStep: "execute",
      createdAt: new Date().toISOString(),
      status: "active",
      resolvedAt: undefined,
      resolvedByContinuationId: undefined,
      invalidatedAt: undefined,
      invalidationReason: undefined,
    });

    await store.saveContinuation({
      continuationId: "continuation_1",
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      kind: "approval_resolution",
      approvalRequestId: "approval_1",
      decision: "approved",
      step: "execute",
    });

    const suspension = await store.loadActiveSuspensionByRun("run_1");
    const continuation = await store.loadContinuation("continuation_1");
    const consumed = await store.consumeContinuation("continuation_1");
    const consumedAgain = await store.consumeContinuation("continuation_1");
    const resolved = await store.resolveSuspension({
      suspensionId: "suspension_1",
      continuationId: "continuation_1",
    });
    const resolvedAgain = await store.resolveSuspension({
      suspensionId: "suspension_1",
      continuationId: "continuation_1",
    });
    const activeAfterResolve = await store.loadActiveSuspensionByRun("run_1");

    expect(suspension?.reasonKind).toBe("waiting_approval");
    expect(suspension?.reasonKind === "waiting_approval" ? suspension.approvalRequestId : undefined).toBe("approval_1");
    expect(continuation?.kind).toBe("approval_resolution");
    expect(consumed?.status).toBe("consumed");
    expect(consumedAgain).toBeUndefined();
    expect(resolved).toBe(true);
    expect(resolvedAgain).toBe(false);
    expect(activeAfterResolve).toBeUndefined();
  });

  test("保存 plan decision suspension，并通过 continuation 恢复原 run-loop", async () => {
    const store = await createStore();
    await store.saveState({
      stateVersion: 1,
      engineVersion: "run-loop-v1",
      threadId: "thread_plan_decision",
      runId: "run_plan_decision",
      taskId: "task_plan_decision",
      input: "我要开发一个登录界面",
      nextStep: "waiting_plan_decision",
      planDecision: {
        question: "请选择登录界面的实现方案",
        sourceInput: "我要开发一个登录界面",
        options: [
          {
            id: "simple",
            label: "简洁表单",
            description: "只包含账号、密码和提交按钮。",
            continuation: "按简洁表单方案实现登录界面。",
          },
        ],
      },
      artifacts: [],
      latestArtifacts: [],
    });
    await store.saveSuspension({
      suspensionId: "suspension_plan_decision",
      threadId: "thread_plan_decision",
      runId: "run_plan_decision",
      taskId: "task_plan_decision",
      reasonKind: "waiting_plan_decision",
      summary: "请选择登录界面的实现方案",
      planDecision: {
        question: "请选择登录界面的实现方案",
        sourceInput: "我要开发一个登录界面",
        options: [
          {
            id: "simple",
            label: "简洁表单",
            description: "只包含账号、密码和提交按钮。",
            continuation: "按简洁表单方案实现登录界面。",
          },
        ],
      },
      resumeStep: "plan",
      createdAt: new Date().toISOString(),
      status: "active",
    });

    const result = await store.applyPlanDecisionContinuation({
      continuation: {
        continuationId: "continuation_plan_decision",
        threadId: "thread_plan_decision",
        runId: "run_plan_decision",
        taskId: "task_plan_decision",
        kind: "plan_decision",
        optionId: "simple",
        optionLabel: "简洁表单",
        input: "我要开发一个登录界面\n\n已选择方案：简洁表单\n按简洁表单方案实现登录界面。",
        status: "created",
      },
      expectedStateVersion: 1,
      expectedEngineVersion: "run-loop-v1",
    });

    const activeAfterResolve = await store.loadActiveSuspensionByRun("run_plan_decision");
    const continuation = await store.loadContinuation("continuation_plan_decision");
    const state = await store.loadByRun("run_plan_decision");

    expect(result.disposition).toBe("resumed");
    expect(result.suspension?.status).toBe("resolved");
    expect(activeAfterResolve).toBeUndefined();
    expect(continuation?.status).toBe("consumed");
    expect(state?.nextStep).toBe("plan");
    expect(state?.planDecision).toBeUndefined();
    expect(state?.input).toContain("已选择方案：简洁表单");
  });

  test("拒绝匿名 continuation 落盘，并允许失效挂起与 continuation", async () => {
    const store = await createStore();

    await store.saveSuspension({
      suspensionId: "suspension_2",
      threadId: "thread_2",
      runId: "run_2",
      taskId: "task_2",
      reasonKind: "waiting_approval",
      summary: "Approval required before deleting stale.txt",
      approvalRequestId: "approval_2",
      resumeStep: "execute",
      createdAt: new Date().toISOString(),
      status: "active",
      resolvedAt: undefined,
      resolvedByContinuationId: undefined,
      invalidatedAt: undefined,
      invalidationReason: undefined,
    });

    await expect(
      store.saveContinuation({
        continuationId: "continuation_anonymous",
        threadId: "",
        runId: "",
        taskId: "task_2",
        kind: "approval_resolution",
        approvalRequestId: "approval_2",
        decision: "rejected",
      }),
    ).rejects.toThrow(/runId and threadId/i);

    await store.saveContinuation({
      continuationId: "continuation_2",
      threadId: "thread_2",
      runId: "run_2",
      taskId: "task_2",
      kind: "approval_resolution",
      approvalRequestId: "approval_2",
      decision: "rejected",
      reason: "continue safely",
      step: "plan",
    });

    const invalidatedSuspension = await store.invalidateSuspension({
      suspensionId: "suspension_2",
      reason: "cancelled by user",
    });
    const invalidatedContinuation = await store.invalidateContinuation({
      continuationId: "continuation_2",
      reason: "recovery action replaced this continuation",
    });
    const activeAfterInvalidate = await store.loadActiveSuspensionByRun("run_2");
    const continuationAfterInvalidate = await store.loadContinuation("continuation_2");

    expect(invalidatedSuspension).toBe(true);
    expect(invalidatedContinuation).toBe(true);
    expect(activeAfterInvalidate).toBeUndefined();
    expect(continuationAfterInvalidate?.status).toBe("invalidated");
  });

  test("把 continuation 的 taskId 与 approvalRequestId 作为一等列持久化", async () => {
    const store = await createStore();
    await store.saveContinuation({
      continuationId: "continuation_columns",
      threadId: "thread_columns",
      runId: "run_columns",
      taskId: "task_columns",
      kind: "approval_resolution",
      approvalRequestId: "approval_columns",
      decision: "approved",
      step: "execute",
      status: "created",
    });

    const db = (store as unknown as { db: { query: <TRow, TArgs extends unknown[]>(sql: string) => { get: (...args: TArgs) => TRow } } }).db;
    const row = db
      .query<{ task_id: string | null; approval_request_id: string | null }, [string]>(
        `SELECT task_id, approval_request_id
         FROM run_continuations
         WHERE continuation_id = ?`,
      )
      .get("continuation_columns");

    expect(row.task_id).toBe("task_columns");
    expect(row.approval_request_id).toBe("approval_columns");
  });

  test("删除 active state 时保留审计记录，并支持按保留期清理", async () => {
    const store = await createStore();
    await store.saveState({
      stateVersion: 1,
      engineVersion: "run-loop-v1",
      threadId: "thread_gc",
      runId: "run_gc",
      taskId: "task_gc",
      input: "gc old audit records",
      nextStep: "waiting_approval",
      artifacts: [],
      latestArtifacts: [],
    });
    await store.saveSuspension({
      suspensionId: "suspension_gc",
      threadId: "thread_gc",
      runId: "run_gc",
      taskId: "task_gc",
      reasonKind: "waiting_approval",
      summary: "Approval required before deleting gc.txt",
      approvalRequestId: "approval_gc",
      resumeStep: "execute",
      createdAt: "2026-04-01T00:00:00.000Z",
      status: "resolved",
      resolvedAt: "2026-04-01T00:00:00.000Z",
      resolvedByContinuationId: "continuation_gc",
      invalidatedAt: undefined,
      invalidationReason: undefined,
    });
    await store.saveContinuation({
      continuationId: "continuation_gc",
      threadId: "thread_gc",
      runId: "run_gc",
      taskId: "task_gc",
      kind: "approval_resolution",
      approvalRequestId: "approval_gc",
      decision: "approved",
      step: "execute",
      status: "consumed",
      consumedAt: "2026-04-01T00:00:00.000Z",
      invalidatedAt: undefined,
      invalidationReason: undefined,
    });

    await store.deleteActiveRunState("run_gc");
    const stateAfterDelete = await store.loadByRun("run_gc");
    const continuationBeforeGc = await store.loadContinuation("continuation_gc");

    expect(stateAfterDelete).toBeUndefined();
    expect(continuationBeforeGc?.status).toBe("consumed");

    const deleted = await store.deleteExpiredAuditRecords("2026-04-10T00:00:00.000Z");
    const continuationAfterGc = await store.loadContinuation("continuation_gc");

    expect(deleted.continuations).toBe(1);
    expect(deleted.suspensions).toBe(1);
    expect(continuationAfterGc).toBeUndefined();
  });
});
