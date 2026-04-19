import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveOpenPXConfigPaths } from "./paths";
import { OPENPX_CONFIG_SCHEMA_URL } from "./schema";

/** 首次启动时写入用户级配置文件的默认模板。 */
export const INITIAL_OPENPX_USER_CONFIG_TEMPLATE = `{
${OPENPX_CONFIG_SCHEMA_URL ? `  "$schema": "${OPENPX_CONFIG_SCHEMA_URL}",\n` : ""}  // 如需配置 provider 与模型槽位，可按下面示例取消注释并填写：
  // "provider": {
  //   "openai": {
  //     "apiKey": "sk-...",
  //     "baseURL": "https://api.openai.com/v1"
  //   },
  //   "groq": {
  //     "apiKey": "gsk-...",
  //     "baseURL": "https://api.groq.com/openai/v1"
  //   }
  // },
  // "model": {
  //   "default": {
  //     "provider": "openai",
  //     "name": "gpt-5.4"
  //   },
  //   // small 可选；如果不配置，会自动回落到 default 模型。
  //   "small": {
  //     "provider": "groq",
  //     "name": "llama-3.1-8b-instant"
  //   }
  // }
}
`;

/** 确保用户级主配置文件存在；若不存在，则按首次启动模板初始化。 */
export async function ensureUserOpenPXConfigFile(input: {
  workspaceRoot: string;
  homeDir?: string;
}): Promise<{
  path: string;
  created: boolean;
}> {
  const paths = resolveOpenPXConfigPaths({
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
  });
  const userLayer = paths.layers.find((layer) => layer.name === "user");
  if (!userLayer) {
    throw new Error("user config path is missing");
  }

  await mkdir(dirname(userLayer.path), { recursive: true });

  try {
    await writeFile(userLayer.path, INITIAL_OPENPX_USER_CONFIG_TEMPLATE, {
      encoding: "utf8",
      flag: "wx",
    });
    return {
      path: userLayer.path,
      created: true,
    };
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "EEXIST"
    ) {
      return {
        path: userLayer.path,
        created: false,
      };
    }
    throw error;
  }
}
