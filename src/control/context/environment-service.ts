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
   * Converts an absolute path to a workspace-relative path.
   * Ensures forward-compatibility for cloud sync and different machine paths.
   */
  toRelative(absolutePath: string): string {
    if (!isAbsolute(absolutePath)) return absolutePath;
    return relative(this.workspaceRoot, absolutePath);
  }

  /**
   * Converts a workspace-relative path back to an absolute path.
   */
  toAbsolute(relativePath: string): string {
    if (isAbsolute(relativePath)) return relativePath;
    return join(this.workspaceRoot, relativePath);
  }

  /**
   * Captures a structured snapshot of the current physical environment.
   */
  async captureSnapshot(currentCwd: string, criticalFiles: string[] = []): Promise<EnvironmentSnapshot> {
    let gitHead: string | undefined;
    let isDirty = false;

    try {
      gitHead = execSync("git rev-parse HEAD", { cwd: this.workspaceRoot, stdio: "pipe" }).toString().trim();
      const status = execSync("git status --porcelain", { cwd: this.workspaceRoot, stdio: "pipe" }).toString().trim();
      isDirty = status.length > 0;
    } catch (e) {
      // Not a git repo or git not available
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
   * Verifies if the current physical state matches the captured snapshot.
   */
  verifyAlignment(snapshot: EnvironmentSnapshot, currentCwd: string): { aligned: boolean; reason?: string } {
    const currentRelativeCwd = this.toRelative(currentCwd);
    if (currentRelativeCwd !== snapshot.relativeCwd) {
      return { aligned: false, reason: `CWD mismatch: expected ${snapshot.relativeCwd}, got ${currentRelativeCwd}` };
    }

    // For Git, we primarily warn if the head changed, as that's a major context shift
    try {
      const currentHead = execSync("git rev-parse HEAD", { cwd: this.workspaceRoot, stdio: "pipe" }).toString().trim();
      if (snapshot.gitHead && currentHead !== snapshot.gitHead) {
        return { aligned: false, reason: `Git HEAD mismatch: expected ${snapshot.gitHead}, got ${currentHead}` };
      }
    } catch (e) {
      // Ignore if not a git repo
    }

    return { aligned: true };
  }
}
