/** 
 * @module shared/config
 * 应用配置（AppConfig）解析模块。
 * 
 * 负责从工作区目录和环境变量中解析出应用运行所需的完整配置，
 * 包括工作区根路径、项目标识、数据目录和模型参数。
 * 
 * 术语对照：workspaceRoot=工作区根路径，projectId=项目标识，
 * dataDir=数据目录，checkpoint=检查点
 */
import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

/** 应用配置类型，包含工作区、项目和模型相关参数 */
export type AppConfig = {
  workspaceRoot: string;             // 工作区根路径
  projectId: string;                 // 项目标识，用于隔离不同项目的数据
  dataDir: string;                   // 数据存储目录
  checkpointConnString: string;      // 检查点数据库连接字符串
  model: {                           // 模型相关配置
    apiKey?: string;               // API 密钥，从 OPENAI_API_KEY 环境变量读取
    baseURL?: string;              // API 基础 URL，从 OPENAI_BASE_URL 环境变量读取
    name?: string;                 // 模型名称，从 OPENAI_MODEL 环境变量读取
    thinking?: "high" | "medium" | "low" | "off";  // 思考级别，从 OPENPX_THINKING 环境变量读取
  };
};

/** 从 package.json 或目录名解析项目标识，找不到时回退到 "default-project" */
function resolveProjectId(workspaceRoot: string): string {
  const pkgPath = join(workspaceRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;  // 优先使用 package.json 中的 name 字段
    } catch {
      // 解析失败时忽略，回退到目录名
    }
  }
  // 无法从 package.json 获取时，取路径最后一段作为项目标识
  return resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

/** 解析并组装完整的 AppConfig，自动推断缺失的项目标识和模型参数 */
export function resolveConfig(input: { 
  workspaceRoot: string;             // 工作区根路径 
  dataDir: string;                   // 数据存储目录
  projectId?: string;
}): AppConfig {
  const workspaceRoot = resolve(input.workspaceRoot);  // 规范化绝对路径
  const projectId = input.projectId ?? resolveProjectId(workspaceRoot);  // 未指定时自动推断
  const thinkingEnv = process.env.OPENPX_THINKING as AppConfig["model"]["thinking"];  // 思考级别环境变量
  return {
    workspaceRoot,
    projectId,
    dataDir: input.dataDir,
    checkpointConnString: input.dataDir,
    model: {                           // 模型相关配置
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      name: process.env.OPENAI_MODEL,
      thinking: thinkingEnv,
    },
  };
}
