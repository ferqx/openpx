import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { createRuntimeService } from "./runtime-service";
import { createHttpServer } from "./runtime-http-server";

export type RuntimeDaemonOptions = {
  dataDir: string;
  workspaceRoot: string;
};

export async function ensureRuntime(options: RuntimeDaemonOptions) {
  const lockDir = join(options.dataDir, "runtime");
  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  const lockFile = join(lockDir, "daemon.json");
  
  if (existsSync(lockFile)) {
    const info = JSON.parse(readFileSync(lockFile, "utf-8"));
    try {
      // Check if server is alive
      const res = await fetch(`http://localhost:${info.port}/snapshot`);
      if (res.ok) {
        return info;
      }
    } catch (e) {
      // Server is dead, clean up lockfile
      try { unlinkSync(lockFile); } catch {}
    }
  }

  // Start new server
  // If dataDir is a directory, append a database filename
  const dbPath = options.dataDir.endsWith(".db") ? options.dataDir : join(options.dataDir, "openwenpx.db");
  
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
