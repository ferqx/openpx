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
  status?: string;
  summary?: string;
  tasks?: KernelTask[];
  approvals?: KernelApproval[];
  workspaceRoot?: string;
  projectId?: string;
};

function isKernelResult(value: unknown): value is KernelResult {
  return typeof value === "object" && value !== null;
}

export function App(input: { kernel: TuiKernel }) {
  const [events, setEvents] = useState<TuiKernelEvent[]>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [approvals, setApprovals] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [composerMode, setComposerMode] = useState<"input" | "confirm">("input");
  const [workspaceRoot, setWorkspaceRoot] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
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

  function applyKernelResult(result: KernelResult) {
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

    if (result.workspaceRoot) setWorkspaceRoot(result.workspaceRoot);
    if (result.projectId) setProjectId(result.projectId);

    if (result.status === "waiting_approval") {
      setComposerMode("confirm");
    } else {
      setComposerMode("input");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!input.kernel.hydrateSession) {
        return;
      }

      const result = await input.kernel.hydrateSession();
      if (cancelled || !isKernelResult(result)) {
        return;
      }

      applyKernelResult(result);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [input.kernel]);

  async function submit(text: string) {
    if (composerMode === "confirm") {
      if (text === "yes") {
        // Continue work - for now we just submit a fake 'continue' command 
        // or re-submit the input if kernel supports it.
        // The plan says "trigger the next step in the graph".
        // We'll assume the kernel handles this or we'll implement 'continue' later.
        const result = await input.kernel.handleCommand({ type: "submit_input", payload: { text: "continue" } } as any);
        if (isKernelResult(result)) {
          applyKernelResult(result);
        }
      } else {
        setComposerMode("input");
      }
      return;
    }

    const value = text.trim();
    if (!value) {
      return;
    }

    const result = await input.kernel.handleCommand(parseCommand(value));
    if (!isKernelResult(result)) {
      return;
    }

    applyKernelResult(result);
  }

  return (
    <Screen
      events={events}
      tasks={tasks}
      approvals={approvals}
      answer={answer}
      composerMode={composerMode}
      workspaceRoot={workspaceRoot}
      projectId={projectId}
      onSubmit={submit}
    />
  );
}
