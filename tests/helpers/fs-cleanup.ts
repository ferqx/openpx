import fs from "node:fs/promises";

const RETRYABLE_REMOVE_ERROR_CODES = new Set([
  "EBUSY",
  "EPERM",
  "ENOTEMPTY",
]);

type RemoveFunction = (
  targetPath: string,
  options: {
    recursive: boolean;
    force: boolean;
  },
) => Promise<void>;

type RemoveWithRetryOptions = {
  recursive?: boolean;
  force?: boolean;
  retries?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  remove?: RemoveFunction;
};

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code);
  }
  return undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 跨平台删除辅助：
 * Windows 常见 sqlite WAL 句柄延迟释放；
 * Linux / macOS 上目录竞争删除时也可能出现瞬时 ENOTEMPTY。
 */
export async function removeWithRetry(
  targetPath: string,
  options?: RemoveWithRetryOptions,
): Promise<void> {
  const retries = options?.retries ?? 24;
  const delayMs = options?.delayMs ?? 250;
  const sleep = options?.sleep ?? defaultSleep;
  const remove = options?.remove ?? fs.rm.bind(fs);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await remove(targetPath, {
        recursive: options?.recursive ?? false,
        force: options?.force ?? false,
      });
      return;
    } catch (error) {
      const code = getErrorCode(error);
      const shouldRetry = code ? RETRYABLE_REMOVE_ERROR_CODES.has(code) : false;
      if (!shouldRetry || attempt === retries) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
}
