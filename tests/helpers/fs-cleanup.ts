import fs from "node:fs/promises";

/** Windows 上 sqlite WAL 句柄释放有时会延迟，删除临时目录时做短暂重试。 */
export async function removeWithRetry(targetPath: string, options?: {
  recursive?: boolean;
  force?: boolean;
  retries?: number;
  delayMs?: number;
}): Promise<void> {
  const retries = options?.retries ?? 24;
  const delayMs = options?.delayMs ?? 250;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fs.rm(targetPath, {
        recursive: options?.recursive ?? false,
        force: options?.force ?? false,
      });
      return;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined;
      if ((code !== "EBUSY" && code !== "EPERM") || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
