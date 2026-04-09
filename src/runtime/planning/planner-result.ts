import { z } from "zod";
import { workPackageSchema } from "./work-package";

export const plannerResultSchema = z.object({
  workPackages: z.array(workPackageSchema),
  acceptanceCriteria: z.array(z.string().min(1)),
  riskFlags: z.array(z.string().min(1)),
  approvalRequiredActions: z.array(z.string().min(1)),
  verificationScope: z.array(z.string().min(1)),
});

export type PlannerResult = z.infer<typeof plannerResultSchema>;
