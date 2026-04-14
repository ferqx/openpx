import type { ResumeControl } from "../resume-control";

/** intake 节点：把 resume 文本合并进 input，并在消费后清空 resumeValue */
export function intakeNode(state: { input: string; resumeValue?: string | ResumeControl }) {
  let input = state.input;
  if (state.resumeValue && typeof state.resumeValue === "string") {
    const resumeText = state.resumeValue.toLowerCase();
    const isConfirmation = /\b(yes|ok|approve|confirm|start|proceed)\b/.test(resumeText);
    // 明确确认词不覆盖原 input；其他文本则被视为新的用户补充输入。
    if (!isConfirmation) {
      input = state.resumeValue;
    }
  }

  return {
    input: input.trim(),
    resumeValue: undefined, // 消费后清空，避免后续节点重复使用同一份 resume 输入
  };
}
