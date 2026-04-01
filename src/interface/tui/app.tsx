import React, { useEffect, useState } from "react";
import { parseCommand } from "./commands";
import { Screen } from "./screen";
import type { TuiKernel, TuiKernelEvent } from "./hooks/use-kernel";

type KernelTask = {
  taskId: string;
  summary?: string;
  status: string;
};

type KernelApproval = {
  approvalRequestId: string;
  summary: string;
  status: string;
};

type KernelResult = {
  summary?: string;
  tasks?: KernelTask[];
  approvals?: KernelApproval[];
};

function isKernelResult(value: unknown): value is KernelResult {
  return typeof value === "object" && value !== null;
}

export function App(input: { kernel: TuiKernel }) {
  const [events, setEvents] = useState<TuiKernelEvent[]>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [approvals, setApprovals] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [answer, setAnswer] = useState({
    summary: "Awaiting answer",
    changes: [] as Array<{ path: string; additions: number; deletions: number }>,
    verification: [] as string[],
  });

  useEffect(() => {
    return input.kernel.events.subscribe((event) => {
      setEvents((current) => [...current, event]);
    });
  }, [input.kernel]);

  async function submit(text: string) {
    const value = text.trim();
    if (!value) {
      return;
    }

    const result = await input.kernel.handleCommand(parseCommand(value));
    if (!isKernelResult(result)) {
      return;
    }

    setTasks(
      (result.tasks ?? []).map((task) => ({
        id: task.taskId,
        title: task.summary ?? task.taskId,
        status: task.status,
      })),
    );
    setApprovals(
      (result.approvals ?? []).map((approval) => ({
        id: approval.approvalRequestId,
        title: approval.summary,
        status: approval.status,
      })),
    );
    setAnswer((current) => ({
      ...current,
      summary: result.summary ?? current.summary,
    }));
  }

  return (
    <Screen
      events={events}
      tasks={tasks}
      approvals={approvals}
      answer={answer}
      onSubmit={submit}
    />
  );
}
