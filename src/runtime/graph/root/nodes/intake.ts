export function intakeNode(state: { input: string }) {
  return {
    input: state.input.trim(),
  };
}
