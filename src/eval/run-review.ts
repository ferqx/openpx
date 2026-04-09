import { executeEvalReviewCommand } from "./review-queue";

const exitCode = await executeEvalReviewCommand(process.argv.slice(2));
process.exit(exitCode);
