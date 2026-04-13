import { executeEvalSuiteCommand } from "./suite-runner";

// `bun run eval:suite` 的兼容壳层；真实 CLI 行为放在 `suite-runner.ts`，
// 这样这个文件就不会再被误读成权威实现入口。
const exitCode = await executeEvalSuiteCommand(process.argv.slice(2));
process.exit(exitCode);
