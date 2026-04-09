import { executeEvalSuiteCommand } from "./suite-runner";

const exitCode = await executeEvalSuiteCommand(process.argv.slice(2));
process.exit(exitCode);
