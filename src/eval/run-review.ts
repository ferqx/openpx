import { executeEvalReviewCommand } from "./review-queue";

// eval:review CLI 壳层：真实逻辑在 review-queue.ts 中。
const exitCode = await executeEvalReviewCommand(process.argv.slice(2));
process.exit(exitCode);
