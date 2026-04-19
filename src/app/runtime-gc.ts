import { SqliteRunStateStore } from "../persistence/sqlite/sqlite-run-state-store";
import { resolveConfig } from "../shared/config";

export const RUN_STATE_AUDIT_RETENTION_DAYS = 7;

/** 计算 run-loop 审计记录的过期阈值。 */
export function calculateRunStateAuditCutoff(now = new Date()): string {
  return new Date(now.getTime() - (RUN_STATE_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)).toISOString();
}

export async function runRuntimeGc(input?: {
  workspaceRoot?: string;
  dataDir?: string;
  projectId?: string;
  now?: Date;
}) {
  const config = resolveConfig({
    workspaceRoot: input?.workspaceRoot ?? process.cwd(),
    dataDir: input?.dataDir ?? process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ".openpx",
    projectId: input?.projectId,
    allowMissingModel: true,
  });
  const store = new SqliteRunStateStore(config.dataDir);
  try {
    const deleted = await store.deleteExpiredAuditRecords(calculateRunStateAuditCutoff(input?.now));
    return {
      cutoffIso: calculateRunStateAuditCutoff(input?.now),
      deleted,
      dataDir: config.dataDir,
    };
  } finally {
    await store.close();
  }
}

export async function runRuntimeGcCli(args: string[] = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: bun run runtime:gc

Deletes expired run-loop audit records older than ${RUN_STATE_AUDIT_RETENTION_DAYS} days.
`);
    return;
  }

  const result = await runRuntimeGc();
  console.log(
    JSON.stringify(
      {
        dataDir: result.dataDir,
        cutoffIso: result.cutoffIso,
        deleted: result.deleted,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  await runRuntimeGcCli();
}
