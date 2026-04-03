import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { createRuntimeService } from "./runtime-service";
import { createHttpServer, dispatchRuntimeRequest } from "./runtime-http-server";

export type RuntimeDaemonOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

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
  const runtime = await createRuntimeService({
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
