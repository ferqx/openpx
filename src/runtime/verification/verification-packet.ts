import { z } from "zod";

export const verificationChangedFileSchema = z.object({
  path: z.string().min(1),
  summary: z.string().min(1),
});

export const verificationPacketSchema = z.object({
  acceptanceCriteria: z.array(z.string().min(1)),
  changedFiles: z.array(verificationChangedFileSchema),
  artifactRefs: z.array(z.string().min(1)),
  buildEvidence: z.array(z.string().min(1)),
  diffSnippets: z.array(z.string().min(1)).default([]),
});

export type VerificationChangedFile = z.infer<typeof verificationChangedFileSchema>;
export type VerificationPacket = z.infer<typeof verificationPacketSchema>;
