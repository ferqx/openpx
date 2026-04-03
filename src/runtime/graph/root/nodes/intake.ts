export function intakeNode(state: { input: string; resumeValue?: any }) {
  let input = state.input;
  if (state.resumeValue && typeof state.resumeValue === "string") {
    input = state.resumeValue;
  }

  return {
    input: input.trim(),
    resumeValue: undefined, // Clear after use
  };
}
