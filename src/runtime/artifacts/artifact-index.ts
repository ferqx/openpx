import { z } from "zod";

/** artifact 类型：patch/test/log/summary */
export const artifactKindSchema = z.enum(["patch", "test", "log", "summary"]);

/** artifact 记录：连接 work package 与其产物引用 */
export const artifactRecordSchema = z.object({
  ref: z.string().min(1),
  kind: artifactKindSchema,
  summary: z.string().min(1),
  workPackageId: z.string().min(1),
});

export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
