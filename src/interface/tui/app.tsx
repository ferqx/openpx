import React from "react";
import { Screen } from "./screen";
import { useKernel, type TuiKernel } from "./hooks/use-kernel";

export function App(input: { kernel: TuiKernel }) {
  const { events, submit } = useKernel(input.kernel);

  return (
    <Screen
      events={events}
      tasks={[]}
      approvals={[]}
      answer={{
        summary: "Awaiting answer",
        changes: [],
        verification: [],
      }}
      onSubmit={submit}
    />
  );
}
