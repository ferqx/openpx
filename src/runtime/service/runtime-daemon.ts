import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { createHarnessAppServer } from "../../harness/server/app-server";
import { createHarnessSessionRegistry } from "../../harness/server/harness-session-registry";
import { dispatchRuntimeRequest } from "../../harness/server/http/runtime-http-server";
import { CURRENT_PROTOCOL_VERSION as PROTOCOL_VERSION } from "../../harness/protocol/schemas/protocol-version";

export type RuntimeDaemonOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

type HealthResponse = {
  status?: string;
  protocolVersion?: string;
};

type RuntimeDaemonInfo = {
  port: number;
  pid: number;
};

const activeDaemons = new Map<string, RuntimeDaemonInfo>();

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

  const lockFile = join(lockDir, "device-runtime.daemon.json");

  const inProcessDaemon = activeDaemons.get(lockFile);
  if (inProcessDaemon) {
    return inProcessDaemon;
  }
  
  if (existsSync(lockFile)) {
    // lockfile 对应的是设备级共享 daemon，只要 app server 仍存活就应复用。
    const info = JSON.parse(readFileSync(lockFile, "utf-8"));
    try {
      const healthUrl = new URL(`http://localhost:${info.port}/health`);
      const res = await dispatchRuntimeRequest(healthUrl, {
        signal: AbortSignal.timeout(250),
        headers: {
          "x-openpx-protocol-version": PROTOCOL_VERSION,
        },
      });
      if (res.ok) {
        const health = await res.json() as HealthResponse;
        if (health.status === "ok" && health.protocolVersion === PROTOCOL_VERSION) {
          activeDaemons.set(lockFile, info as RuntimeDaemonInfo);
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
  const appServer = createHarnessAppServer(runtime);
  
  const info: RuntimeDaemonInfo = {
    port: appServer.http.port,
    pid: process.pid,
  };

  writeFileSync(lockFile, JSON.stringify(info));
  activeDaemons.set(lockFile, info);

  // Handle process exit to cleanup lockfile if it's the daemon
  process.on("exit", () => {
    if (existsSync(lockFile)) {
      const currentInfo = JSON.parse(readFileSync(lockFile, "utf-8"));
      if (currentInfo.pid === process.pid) {
        unlinkSync(lockFile);
      }
    }
    activeDaemons.delete(lockFile);
  });

  return info;
}
