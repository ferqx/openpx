import React, { useEffect, useRef, useState } from "react";
import { useInput } from "ink";
import { parseCommand } from "./commands";
import { Screen } from "./screen";
import type { TuiKernel, TuiKernelEvent, TuiSessionResult } from "./hooks/use-kernel";
import type { ApprovalCommand } from "./commands";
import type { RuntimeSessionState } from "../runtime/runtime-session";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  timestamp: number;
};

type ThinkingState = {
  content: string;
  startedAt: number;
  duration?: number;
};

export function App(input: { kernel: TuiKernel }) {
  const [session, setSession] = useState<RuntimeSessionState | undefined>();
  const [modelStatus, setModelStatus] = useState<"idle" | "thinking" | "responding">("idle");
  const [runtimeStatus, setRuntimeStatus] = useState<"connected" | "disconnected">("disconnected");
  const [showThreadPanel, setShowThreadPanel] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState<ThinkingState | null>(null);
  const thinkingRef = useRef<ThinkingState | null>(null);

  // Performance tracking
  const [performance, setPerformance] = useState({ waitMs: 0, genMs: 0 });
  const [metricsStart, setMetricsStart] = useState<{ thinking?: number; responding?: number }>({});

  useInput((input, key) => {
    if (input === "t" && key.ctrl) {
      setShowThreadPanel(prev => !prev);
    }
  });

  useEffect(() => {
    let interval: Timer | undefined;

    if (modelStatus === "thinking") {
      const start = Date.now();
      setMetricsStart({ thinking: start });
      setPerformance({ waitMs: 0, genMs: 0 });
      interval = setInterval(() => {
        setPerformance(p => ({ ...p, waitMs: Date.now() - start }));
      }, 100);
    } else if (modelStatus === "responding") {
      const start = Date.now();
      const waitTime = metricsStart.thinking ? start - metricsStart.thinking : 0;
      setMetricsStart(prev => ({ ...prev, responding: start }));
      setPerformance(p => ({ ...p, waitMs: waitTime, genMs: 0 }));
      interval = setInterval(() => {
        setPerformance(p => ({ ...p, genMs: Date.now() - start }));
      }, 100);
    }

    return () => { if (interval) clearInterval(interval); };
  }, [modelStatus]);

  function applyKernelResult(result: TuiSessionResult) {
    setSession(result);
    
    if (result.summary && result.summary !== "Awaiting answer") {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          return [...prev.slice(0, -1), {
            ...lastMsg,
            content: result.summary!,
            timestamp: Date.now(),
          }];
        }
        return [...prev, {
          id: `assistant-${Date.now()}`,
          role: "assistant" as const,
          content: result.summary!,
          timestamp: Date.now(),
        }];
      });
    }
  }

  function updateThinking(next: ThinkingState | null) {
    thinkingRef.current = next;
    setThinking(next);
  }

  function handleKernelEvent(event: TuiKernelEvent) {
    if (event.type === "model.status") {
      setModelStatus(event.payload.status);
      return;
    }

    if (event.type === "runtime.status") {
      setRuntimeStatus(event.payload.status);
      return;
    }

    if (event.type === "session.updated") {
      setSession(event.payload);
      return;
    }

    if (event.type === "thread.view_updated") {
      const summary = event.payload.summary;
      if (summary && summary !== "Awaiting answer") {
        const currentThinking = thinkingRef.current;
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          const assistantMsg: Message = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: summary,
            thinking: currentThinking?.content,
            thinkingDuration: currentThinking?.duration,
            timestamp: Date.now(),
          };

          if (lastMsg && lastMsg.role === "assistant") {
            return [...prev.slice(0, -1), assistantMsg];
          }
          return [...prev, assistantMsg];
        });
        updateThinking(null);
      }
      return;
    }

    if (event.type === "stream.thinking_started") {
      updateThinking({ content: "", startedAt: Date.now() });
      return;
    }

    if (event.type === "stream.thinking_chunk") {
      const chunkContent = event.payload.content;
      updateThinking(
        thinkingRef.current
          ? { ...thinkingRef.current, content: thinkingRef.current.content + chunkContent }
          : { content: chunkContent, startedAt: Date.now() },
      );
      return;
    }

    if (event.type === "stream.text_chunk") {
      const chunkContent = event.payload.content;
      if (chunkContent) {
        const currentThinking = thinkingRef.current;
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            return [...prev.slice(0, -1), {
              ...lastMsg,
              content: lastMsg.content + chunkContent,
              thinking: lastMsg.thinking ?? currentThinking?.content,
              thinkingDuration:
                lastMsg.thinkingDuration ??
                (currentThinking ? Date.now() - currentThinking.startedAt : undefined),
            }];
          }
          return [...prev, {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: chunkContent,
            thinking: currentThinking?.content,
            thinkingDuration: currentThinking ? Date.now() - currentThinking.startedAt : undefined,
            timestamp: Date.now(),
          }];
        });
      }
    }
  }

  useEffect(() => {
    return input.kernel.events.subscribe((event) => {
      handleKernelEvent(event);
    });
  }, [input.kernel]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      // Defer hydration to avoid race with initial render
      await new Promise(resolve => setTimeout(resolve, 50));
      if (cancelled) return;
      if (!input.kernel.hydrateSession) return;
      const result = await input.kernel.hydrateSession();
      if (cancelled || !result) return;
      applyKernelResult(result);
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [input.kernel]);

  async function submit(text: string) {
    const composerMode = session?.status === "waiting_approval"
      ? "confirm"
      : session?.status === "blocked"
        ? "blocked"
        : "input";

    if (composerMode === "blocked") return;

    if (composerMode === "confirm") {
      const approvalRequestId = session?.approvals[0]?.approvalRequestId;
      if (!approvalRequestId) {
        return;
      }

      const command: ApprovalCommand = text.toLowerCase() === "yes" 
        ? { type: "approve_request", payload: { approvalRequestId } }
        : { type: "reject_request", payload: { approvalRequestId } };
      
      const result = await input.kernel.handleCommand(command);
      applyKernelResult(result);
      return;
    }

    const value = text.trim();
    if (!value) return;

    setMessages(current => [...current, {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: value,
      timestamp: Date.now(),
    }]);

    const result = await input.kernel.handleCommand(parseCommand(value));
    applyKernelResult(result);
  }

  const composerMode = session?.status === "waiting_approval"
    ? "confirm"
    : session?.status === "blocked"
      ? "blocked"
      : "input";

  return (
    <Screen
      messages={messages}
      tasks={session?.tasks ?? []}
      approvals={session?.approvals ?? []}
      composerMode={composerMode}
      workspaceRoot={session?.workspaceRoot}
      projectId={session?.projectId}
      threadId={session?.threadId}
      modelStatus={modelStatus}
      runtimeStatus={runtimeStatus}
      blockingReason={session?.blockingReason}
      narrativeSummary={session?.narrativeSummary}
      recommendationReason={session?.recommendationReason}
      threads={session?.threads}
      showThreadPanel={showThreadPanel}
      performance={performance}
      modelName={process.env.OPENAI_MODEL ?? "unknown"}
      thinkingLevel={process.env.OPENPX_THINKING ?? "default"}
      onSubmit={submit}
    />
  );
}
