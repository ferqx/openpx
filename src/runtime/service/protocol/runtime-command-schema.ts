import { z } from "zod";

export const runtimeCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new_thread") }),
  z.object({ kind: z.literal("switch_thread"), threadId: z.string().min(1) }),
  z.object({ kind: z.literal("continue"), threadId: z.string().min(1).optional() }),
  z.object({ kind: z.literal("add_task"), content: z.string(), background: z.boolean().optional() }),
  z.object({
    kind: z.literal("resolve_approval"),
    approvalRequestId: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().optional(),
  }),
  z.object({ kind: z.literal("approve"), approvalRequestId: z.string().min(1) }),
  z.object({ kind: z.literal("reject"), approvalRequestId: z.string().min(1), reason: z.string().optional() }),
]);

export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;
