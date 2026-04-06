import type { ResumeControl } from "../resume-control";

export function intakeNode(state: { input: string; resumeValue?: string | ResumeControl }) {
  let input = state.input;
  if (state.resumeValue && typeof state.resumeValue === "string") {
    const resumeText = state.resumeValue.toLowerCase();
    const isConfirmation = /\b(yes|ok|approve|confirm|start|proceed)\b/.test(resumeText);
    if (!isConfirmation) {
      input = state.resumeValue;
    }
  }

  return {
    input: input.trim(),
    resumeValue: undefined, // Clear after use
  };
}
