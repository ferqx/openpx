import { interrupt } from "@langchain/langgraph";
import type { PendingApprovalState, RootMode, RootRoute } from "../context";
import type { ResumeControl } from "../resume-control";

export function approvalGateNode(state: {
  input?: string;
  mode: RootMode;
  pendingApproval?: PendingApprovalState;
  resumeValue?: string | ResumeControl;
  currentWorkPackageId?: string;
}):
  | {
      approved: boolean;
      currentWorkPackageId?: string;
      input?: string;
      mode: RootMode;
      pendingApproval: undefined;
      route: RootRoute;
      resumeValue: undefined;
    }
  | {
      resumeValue: string | ResumeControl;
    } {
  const resolution =
    state.resumeValue && typeof state.resumeValue !== "string" && state.resumeValue.kind === "approval_resolution"
      ? state.resumeValue
      : interrupt({
          kind: "approval",
          mode: "waiting_approval",
          summary: state.pendingApproval?.summary ?? "",
        });

  if (resolution && typeof resolution !== "string" && resolution.kind === "approval_resolution") {
    if (resolution.decision === "approved") {
      return {
        approved: true,
        currentWorkPackageId: state.currentWorkPackageId,
        mode: "execute",
        pendingApproval: undefined,
        route: "executor",
        resumeValue: undefined,
      };
    }

    return {
      approved: false,
      input: resolution.reason ?? state.input,
      mode: "plan",
      pendingApproval: undefined,
      route: "planner",
      resumeValue: undefined,
    };
  }

  return {
    resumeValue: resolution as string | ResumeControl,
  };
}
