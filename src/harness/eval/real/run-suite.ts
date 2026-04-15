import { executeRealEvalSuiteCommand } from "./suite-runner";

/**
 * harness real-eval suite 的 CLI 入口。
 * 这里只保留一层很薄的 shell；
 * 参数解析、报告、执行与汇总逻辑都在 suite-runner 中。
 */
if (import.meta.main) {
  // 这里只保留很薄的一层 shell 入口；参数解析、报告和 runner 逻辑都在
  // `suite-runner.ts` 里。
  const exitCode = await executeRealEvalSuiteCommand(process.argv.slice(2));
  process.exitCode = exitCode;
}
