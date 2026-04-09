import { z } from "zod";

export const verificationVerdictSchema = z.enum(["PASS", "FAIL", "PARTIAL"]);

export const verificationResultSchema = z.object({
  verdict: verificationVerdictSchema,
  summary: z.string().min(1),
  failingCriteria: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
});

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
