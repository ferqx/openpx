import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  INITIAL_OPENPX_USER_CONFIG_TEMPLATE,
  ensureUserOpenPXConfigFile,
} from "../../src/config/initializer";

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ensureUserOpenPXConfigFile", () => {
  test("用户级配置缺失时创建首次启动 skeleton", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    const result = await ensureUserOpenPXConfigFile({
      workspaceRoot,
      homeDir,
    });
    const content = await readFile(result.path, "utf8");

    expect(result.created).toBe(true);
    expect(result.path).toBe(join(homeDir, ".openpx", "openpx.jsonc"));
    expect(content).toBe(INITIAL_OPENPX_USER_CONFIG_TEMPLATE);
    expect(content).not.toContain("\"$schema\"");
    expect(content).toContain("如需配置 provider 与模型槽位");
  });

  test("用户级配置已存在时不覆盖原文件", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");
    const configRoot = join(homeDir, ".openpx");
    const configPath = join(configRoot, "openpx.jsonc");

    await mkdir(configRoot, { recursive: true });
    await writeFile(configPath, "{\n  \"ui\": {\n    \"theme\": \"custom\"\n  }\n}\n", "utf8");

    const result = await ensureUserOpenPXConfigFile({
      workspaceRoot,
      homeDir,
    });
    const content = await readFile(configPath, "utf8");

    expect(result.created).toBe(false);
    expect(content).toContain("\"theme\": \"custom\"");
  });
});
