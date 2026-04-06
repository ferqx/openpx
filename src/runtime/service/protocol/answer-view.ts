import { z } from "zod";

export const answerViewSchema = z.object({
  answerId: z.string().min(1),
  threadId: z.string().min(1),
  content: z.string(),
});

export type AnswerView = z.infer<typeof answerViewSchema>;
