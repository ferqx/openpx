import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { createHarnessSessionRegistry } from "../../harness/server/harness-session-registry";
import { createHttpServer, dispatchRuntimeRequest } from "../../harness/server/http/runtime-http-server";

export type RuntimeDaemonOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

// daemon 的所有权在这里。TUI 应优先复用同一 workspace/project 的既有
// runtime，而不是再创建并行的进程内 runtime。
function resolveProjectId(workspaceRoot: string, projectId?: string): string {
  return projectId ?? resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

function resolveDbPath(dataDir: string): string {
  if (dataDir === ":memory:") {
    return ":memory:";
  }

  return dataDir.endsWith(".db") ? dataDir : join(dataDir, "openpx.db");
}

function resolveRuntimeStateDir(dataDir: string, workspaceRoot: string): string {
  if (dataDir === ":memory:") {
    return join(workspaceRoot, ".openpx-runtime");
  }

  if (dataDir.endsWith(".db")) {
    return join(dirname(dataDir), "runtime");
  }

  return join(dataDir, "runtime");
}

export async function ensureRuntime(options: RuntimeDaemonOptions) {
  const lockDir = resolveRuntimeStateDir(options.dataDir, options.workspaceRoot);
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  const projectId = resolveProjectId(options.workspaceRoot, options.projectId);
  const lockFile = join(lockDir, "device-runtime.daemon.json");
  
  if (existsSync(lockFile)) {
    // 只有当记录的端口仍然服务于同一个 scope 时，才复用这个 daemon。
    const info = JSON.parse(readFileSync(lockFile, "utf-8"));
    try {
      const snapshotUrl = new URL(`http://localhost:${info.port}/snapshot`);
      snapshotUrl.searchParams.set("workspaceRoot", options.workspaceRoot);
      snapshotUrl.searchParams.set("projectId", projectId);

      const res = await dispatchRuntimeRequest(snapshotUrl, {
        signal: AbortSignal.timeout(250),
      });
      if (res.ok) {
        const snapshot = await res.json() as { workspaceRoot?: string; projectId?: string };
        if (snapshot.workspaceRoot === options.workspaceRoot && snapshot.projectId === projectId) {
          return info;
        }
      }
    } catch (e) {
      // Server is dead, clean up lockfile
      try { unlinkSync(lockFile); } catch {}
    }
  }

  const dbPath = resolveDbPath(options.dataDir);
  const runtime = await createHarnessSessionRegistry({
    ...options,
    dataDir: dbPath,
  });
  const server = createHttpServer(runtime);
  
  const info = {
    port: server.port,
    pid: process.pid,
  };

  writeFileSync(lockFile, JSON.stringify(info));

  // Handle process exit to cleanup lockfile if it's the daemon
  process.on("exit", () => {
    if (existsSync(lockFile)) {
      const currentInfo = JSON.parse(readFileSync(lockFile, "utf-8"));
      if (currentInfo.pid === process.pid) {
        unlinkSync(lockFile);
      }
    }
  });

  return info;
}
