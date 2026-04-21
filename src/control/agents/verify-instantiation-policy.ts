import type { AgentRunRoleKind } from "../../domain/agent-run";
import type { AgentRunRuntimeRole } from "../../domain/agent-run";
import type { SubagentId } from "./subagent-spec";

export type VerifyInstantiationReason =
  | "lightweight_verification"
  | "multi_round_verification"
  | "independent_cancellation"
  | "user_visible_lifecycle"
  | "long_running_verification"
  | "significant_token_cost"
  | "significant_compute_cost"
  | "failure_review_value";

export type VerifyInstantiationInput = {
  expectedRoundTrips?: number;
  requiresIndependentCancellation?: boolean;
  requiresUserObservation?: boolean;
  expectedDurationMs?: number;
  significantTokenCost?: boolean;
  significantComputeCost?: boolean;
  failureNeedsSeparateReview?: boolean;
};

export type VerifyInstantiationDecision =
  | {
      kind: "logical_phase";
      instantiateAgentRun: false;
      reasons: readonly ["lightweight_verification"];
    }
  | {
      kind: "agent_run";
      instantiateAgentRun: true;
      roleKind: Extract<AgentRunRoleKind, "subagent">;
      roleId: Extract<SubagentId, "verify">;
      runtimeRole: Extract<AgentRunRuntimeRole, "verifier">;
      reasons: readonly Exclude<VerifyInstantiationReason, "lightweight_verification">[];
    };

const LONG_RUNNING_VERIFY_MS = 30_000;

/** 判断 Verify 应只是逻辑子阶段，还是需要独立 AgentRun 生命周期。 */
export function decideVerifyInstantiation(input: VerifyInstantiationInput): VerifyInstantiationDecision {
  const reasons: Exclude<VerifyInstantiationReason, "lightweight_verification">[] = [];

  if ((input.expectedRoundTrips ?? 1) > 1) {
    reasons.push("multi_round_verification");
  }

  if (input.requiresIndependentCancellation) {
    reasons.push("independent_cancellation");
  }

  if (input.requiresUserObservation) {
    reasons.push("user_visible_lifecycle");
  }

  if ((input.expectedDurationMs ?? 0) >= LONG_RUNNING_VERIFY_MS) {
    reasons.push("long_running_verification");
  }

  if (input.significantTokenCost) {
    reasons.push("significant_token_cost");
  }

  if (input.significantComputeCost) {
    reasons.push("significant_compute_cost");
  }

  if (input.failureNeedsSeparateReview) {
    reasons.push("failure_review_value");
  }

  if (reasons.length === 0) {
    return {
      kind: "logical_phase",
      instantiateAgentRun: false,
      reasons: ["lightweight_verification"],
    };
  }

  return {
    kind: "agent_run",
    instantiateAgentRun: true,
    roleKind: "subagent",
    roleId: "verify",
    runtimeRole: "verifier",
    reasons,
  };
}
