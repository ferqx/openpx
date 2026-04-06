export type RecoveryFacts = {
  /** ULID of the thread */
  threadId: string;
  /** Monotonic revision number, increments on every compaction/state change */
  revision: number;
  /** Version of the fact schema to support future migrations */
  schemaVersion: number;
  /** Thread status */
  status: string;
  /** UTC ISO8601 timestamp of when this fact was updated */
  updatedAt: string;

  /** Physical workspace context at the time of compaction */
  environment?: {
    /** Git head hash */
    gitHead?: string;
    /** Whether there are uncommitted changes */
    isDirty: boolean;
    /** Current working directory relative to workspace root */
    relativeCwd: string;
    /** Fingerprints of critical files (e.g. package.json, lockfiles) */
    fingerprints: Record<string, string>;
  };

  /** Last stable state of the execution ledger to prevent double-execution on resume */
  ledgerState?: {
    lastCompletedToolCallId?: string;
    pendingToolCallId?: string;
  };

  activeTask?: {
    taskId: string;
    status: string;
    summary: string;
  };
  lastStableTask?: {
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
    createdAt: string;
  }>;
  conversationHistory?: Array<{
    messageId: string;
    role: "user" | "assistant";
    content: string;
    /** UTC ISO8601 */
    createdAt: string;
  }>;
  latestDurableAnswer?: {
    answerId: string;
    summary: string;
    /** UTC ISO8601 */
    createdAt: string;
  };
  resumeAnchor?: {
    lastEventSeq: number;
    /** Narrative revision tracked alongside recovery facts */
    narrativeRevision: number;
  };
};

export type NarrativeState = {
  /** Monotonic revision that should match or trail RecoveryFacts.revision */
  revision: number;
  threadSummary: string;
  taskSummaries: string[];
  openLoops: string[];
  notableEvents: string[];
  /** UTC ISO8601 */
  updatedAt: string;
};

export type WorkingSetWindow = {
  /** Ephemeral revision, not strictly monotonic across sessions */
  revision: number;
  messages: string[];
  toolResults: string[];
  verifierFeedback: string[];
  retrievedMemories: string[];
  /** UTC ISO8601 */
  updatedAt: string;
};

export type DerivedThreadView = {
  recoveryFacts?: RecoveryFacts;
  narrativeState?: NarrativeState;
  workingSetWindow?: WorkingSetWindow;
};
