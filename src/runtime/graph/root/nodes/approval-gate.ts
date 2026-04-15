import { interrupt } from "@langchain/langgraph";
import type { PendingApprovalState, RootMode, RootRoute } from "../context";
import type { ResumeControl } from "../resume-control";

/** approval-gate：若尚未收到结构化审批决议，则主动 interrupt 等待人类输入 */
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
      // 批准后直接回 executor，继续当前 work package。
      return {
        approved: true,
        currentWorkPackageId: state.currentWorkPackageId,
        mode: "execute",
        pendingApproval: undefined,
        route: "executor",
        resumeValue: undefined,
      };
    }

    // 拒绝后回 planner，并把原因带回去让 planner 重新选路径。
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
    // interrupt 返回的 resumeValue 交给上层持久化，等待下一轮恢复。
    resumeValue: resolution as string | ResumeControl,
  };
}
