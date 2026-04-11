import { executeRealEvalSuiteCommand } from "./suite-runner";

if (import.meta.main) {
  const exitCode = await executeRealEvalSuiteCommand(process.argv.slice(2));
  process.exitCode = exitCode;
}
