/** 
 * @module control/context/environment-service
 * 环境服务（environment service）。
 * 
 * 捕获和校验工作区的物理环境状态（git HEAD、文件指纹、CWD 路径），
 * 用于检测水合后的环境偏移，确保 agent 在正确的上下文中继续执行。
 * 
 * 术语对照：environment=环境，snapshot=快照，alignment=对齐，
 * fingerprint=指纹，hydrate=水合/回填
 */
import { relative, join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

export interface EnvironmentSnapshot {
  gitHead?: string;
  isDirty: boolean;
  relativeCwd: string;
  fingerprints: Record<string, string>;
}

export class EnvironmentService {
  constructor(private workspaceRoot: string) {}

  /**
   * 将绝对路径转换为工作区相对路径，确保跨机器路径的向前兼容性。
   * 确保云同步和不同机器路径的向前兼容性。
   */
  toRelative(absolutePath: string): string {
    if (!isAbsolute(absolutePath)) return absolutePath;
    return relative(this.workspaceRoot, absolutePath);
  }

  /**
   * 将工作区相对路径转换回绝对路径。
   */
  toAbsolute(relativePath: string): string {
    if (isAbsolute(relativePath)) return relativePath;
    return join(this.workspaceRoot, relativePath);
  }

  /**
   * 捕获当前物理环境（git 状态、文件指纹等）的结构化快照。
   */
  async captureSnapshot(currentCwd: string, criticalFiles: string[] = []): Promise<EnvironmentSnapshot> {
    let gitHead: string | undefined;
    let isDirty = false;

    try {
      gitHead = execSync("git rev-parse HEAD", { cwd: this.workspaceRoot, stdio: "pipe" }).toString().trim();
      const status = execSync("git status --porcelain", { cwd: this.workspaceRoot, stdio: "pipe" }).toString().trim();
      isDirty = status.length > 0;
    } catch (e) {
      // 非 git 仓库或 git 不可用，忽略错误
    }

    const fingerprints: Record<string, string> = {};
    for (const file of criticalFiles) {
      const absPath = this.toAbsolute(file);
      if (existsSync(absPath)) {
        const content = readFileSync(absPath);
        fingerprints[file] = createHash("sha256").update(content).digest("hex");
      }
    }

    return {
      gitHead,
      isDirty,
      relativeCwd: this.toRelative(currentCwd),
      fingerprints,
    };
  }

  /**
   * 校验当前物理状态是否与快照一致。
   */
  verifyAlignment(snapshot: EnvironmentSnapshot, currentCwd: string): { aligned: boolean; reason?: string } {
    const currentRelativeCwd = this.toRelative(currentCwd);
    if (currentRelativeCwd !== snapshot.relativeCwd) {
      return { aligned: false, reason: `CWD mismatch: expected ${snapshot.relativeCwd}, got ${currentRelativeCwd}` };
    }

    // 对于 Git，主要检查 HEAD 是否变化，因为这是重大的上下文偏移
    try {
      const currentHead = execSync("git rev-parse HEAD", { cwd: this.workspaceRoot, stdio: "pipe" }).toString().trim();
      if (snapshot.gitHead && currentHead !== snapshot.gitHead) {
        return { aligned: false, reason: `Git HEAD mismatch: expected ${snapshot.gitHead}, got ${currentHead}` };
      }
    } catch (e) {
      // 非 git 仓库时忽略
    }

    return { aligned: true };
  }
}
