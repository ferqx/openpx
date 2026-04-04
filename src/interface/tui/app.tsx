import React, { useEffect, useState } from "react";
import { parseCommand } from "./commands";
import { Screen } from "./screen";
import type { TuiKernel, TuiKernelEvent } from "./hooks/use-kernel";
import type { ThreadSummary } from "./components/thread-panel";

type KernelTask = {
  taskId: string;
  summary?: string;
  status: string;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
};

type KernelApproval = {
  approvalRequestId: string;
  summary: string;
  status: string;
};

type KernelResult = {
  status?: string;
  summary?: string;
  narrativeSummary?: string;
  threads?: Array<{
    threadId: string;
    status: string;
    narrativeSummary?: string;
    pendingApprovalCount?: number;
    blockingReasonKind?: "waiting_approval" | "human_recovery";
  }>;
  tasks?: KernelTask[];
  approvals?: KernelApproval[];
  workspaceRoot?: string;
  projectId?: string;
  threadId?: string;
  recommendationReason?: string;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
};

function isKernelResult(value: unknown): value is KernelResult {
  return typeof value === "object" && value !== null;
}

function upsertById<T extends { id: string }>(items: T[], next: T) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) {
    return [...items, next];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

export function App(input: { kernel: TuiKernel }) {
  const [events, setEvents] = useState<TuiKernelEvent[]>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [approvals, setApprovals] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [composerMode, setComposerMode] = useState<"input" | "confirm" | "blocked">("input");
  const [workspaceRoot, setWorkspaceRoot] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [threadId, setThreadId] = useState<string>("");
  const [modelStatus, setModelStatus] = useState<string>("idle");
  const [runtimeStatus, setRuntimeStatus] = useState<string>("disconnected");
  const [recommendationReason, setRecommendationReason] = useState<string | undefined>();
  const [blockingReason, setBlockingReason] = useState<KernelResult["blockingReason"]>();
  const [narrativeSummary, setNarrativeSummary] = useState<string | undefined>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [answer, setAnswer] = useState({
    summary: "Awaiting answer",
    changes: [] as Array<{ path: string; additions: number; deletions: number }>,
    verification: [] as string[],
  });

  useEffect(() => {
    return input.kernel.events.subscribe((event) => {
      if (event.type === "model.status" && typeof event.payload === "object" && event.payload !== null && "status" in event.payload) {
        setModelStatus(String(event.payload.status));
      } else if (event.type === "runtime.status" && typeof event.payload === "object" && event.payload !== null && "status" in event.payload) {
        setRuntimeStatus(String(event.payload.status));
      } else if (event.type === "task.updated" && typeof event.payload === "object" && event.payload !== null && "taskId" in event.payload) {
        const payload = event.payload as KernelTask;
        setTasks((current) =>
          upsertById(current, {
            id: payload.taskId,
            title: payload.summary ?? payload.taskId,
            status: payload.status,
          }),
        );
        if (payload.status === "blocked" && payload.blockingReason) {
          setBlockingReason(payload.blockingReason);
          setComposerMode("blocked");
        }
      } else if (event.type === "approval.pending" && typeof event.payload === "object" && event.payload !== null && "approvalRequestId" in event.payload) {
        const payload = event.payload as KernelApproval;
        setApprovals((current) =>
          upsertById(current, {
            id: payload.approvalRequestId,
            title: payload.summary,
            status: payload.status,
          }),
        );
        setBlockingReason(undefined);
        setComposerMode("confirm");
      } else if (event.type === "answer.updated" && typeof event.payload === "object" && event.payload !== null && "summary" in event.payload) {
        const payload = event.payload as { summary: string };
        setAnswer((current) => ({
          ...current,
          summary: String(payload.summary),
        }));
      } else if (event.type === "thread.waiting_approval" && typeof event.payload === "object" && event.payload !== null) {
        if ("threadId" in event.payload && typeof event.payload.threadId === "string") {
          setThreadId(event.payload.threadId);
        }
        setBlockingReason(undefined);
        setComposerMode("confirm");
      } else if (event.type === "thread.blocked" && typeof event.payload === "object" && event.payload !== null) {
        if ("threadId" in event.payload && typeof event.payload.threadId === "string") {
          setThreadId(event.payload.threadId);
        }
        if ("blockingReason" in event.payload && event.payload.blockingReason) {
          setBlockingReason(event.payload.blockingReason as NonNullable<KernelResult["blockingReason"]>);
        }
        setComposerMode("blocked");
      } else if (event.type === "thread.completed" && typeof event.payload === "object" && event.payload !== null) {
        if ("threadId" in event.payload && typeof event.payload.threadId === "string") {
          setThreadId(event.payload.threadId);
        }
        setBlockingReason(undefined);
        setComposerMode("input");
      }

      if (event.type !== "model.status" && event.type !== "runtime.status") {
        setEvents((current) => [...current, event]);
      }
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
    if (result.threadId) setThreadId(result.threadId);
    setRecommendationReason(result.recommendationReason);
    setBlockingReason(result.blockingReason);
    setNarrativeSummary(result.narrativeSummary);
    setThreads(
      (result.threads ?? []).map((thread) => ({
        id: thread.threadId,
        status: thread.status,
        narrativeSummary: thread.narrativeSummary,
        active: thread.threadId === result.threadId,
        pendingApprovalCount: thread.pendingApprovalCount,
        blockingReasonKind: thread.blockingReasonKind,
      })),
    );

    if (result.status === "waiting_approval") {
      setComposerMode("confirm");
    } else if (result.status === "blocked") {
      setComposerMode("blocked");
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
    if (composerMode === "blocked") {
      return;
    }

    if (composerMode === "confirm") {
      if (text === "yes") {
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
      threadId={threadId}
      modelStatus={modelStatus}
      runtimeStatus={runtimeStatus}
      recommendationReason={recommendationReason}
      blockingReason={blockingReason}
      narrativeSummary={narrativeSummary}
      threads={threads}
      onSubmit={submit}
    />
  );
}
