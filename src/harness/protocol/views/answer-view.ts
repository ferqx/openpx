import { z } from "zod";

/** AnswerView：runtime snapshot 中对外暴露的稳定回答视图 */
export const answerViewSchema = z.object({
  answerId: z.string().min(1),
  threadId: z.string().min(1),
  content: z.string(),
});

export type AnswerView = z.infer<typeof answerViewSchema>;
