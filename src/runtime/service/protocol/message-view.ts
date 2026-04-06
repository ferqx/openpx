import { z } from "zod";

export const messageViewSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type MessageView = z.infer<typeof messageViewSchema>;
