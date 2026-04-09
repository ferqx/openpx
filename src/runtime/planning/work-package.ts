import { z } from "zod";

export const workPackageSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  allowedTools: z.array(z.string().min(1)),
  inputRefs: z.array(z.string().min(1)),
  expectedArtifacts: z.array(z.string().min(1)),
});

export type WorkPackage = z.infer<typeof workPackageSchema>;
