export type RecoveryFacts = {
  activeTask?: {
    taskId: string;
    status: string;
    summary: string;
  };
  blocking?: {
    sourceTaskId: string;
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
  pendingApprovals: Array<{
    approvalRequestId: string;
    taskId: string;
    toolCallId: string;
    summary: string;
    risk: string;
    status: string;
  }>;
  latestDurableAnswer?: {
    answerId: string;
    summary: string;
  };
  resumeAnchor?: {
    lastEventSeq: number;
    narrativeRevision: number;
  };
};

export type NarrativeState = {
  threadSummary: string;
  taskSummaries: string[];
  openLoops: string[];
  notableEvents: string[];
};

export type WorkingSetWindow = {
  messages: string[];
  toolResults: string[];
  verifierFeedback: string[];
  retrievedMemories: string[];
};

export type DerivedThreadView = {
  recoveryFacts?: RecoveryFacts;
  narrativeState?: NarrativeState;
  workingSetWindow?: WorkingSetWindow;
};
