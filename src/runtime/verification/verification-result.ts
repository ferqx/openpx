import { z } from "zod";

/** verifier 结论枚举：PASS/FAIL/PARTIAL */
export const verificationVerdictSchema = z.enum(["PASS", "FAIL", "PARTIAL"]);

/** VerificationResult：verifier 返回的结构化结果 */
export const verificationResultSchema = z.object({
  verdict: verificationVerdictSchema,
  summary: z.string().min(1),
  failingCriteria: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
});

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
