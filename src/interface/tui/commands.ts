export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
  };
};

export function parseCommand(text: string): SubmitInputCommand {
  return {
    type: "submit_input",
    payload: {
      text,
    },
  };
}
