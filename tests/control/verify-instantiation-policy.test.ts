import { describe, expect, test } from "bun:test";
import { decideVerifyInstantiation } from "../../src/control/agents/verify-instantiation-policy";

describe("Verify instantiation policy", () => {
  test("keeps lightweight verification as a logical phase", () => {
    const decision = decideVerifyInstantiation({
      expectedRoundTrips: 1,
      requiresIndependentCancellation: false,
      requiresUserObservation: false,
      expectedDurationMs: 1_000,
      significantTokenCost: false,
      significantComputeCost: false,
      failureNeedsSeparateReview: false,
    });

    expect(decision).toEqual({
      kind: "logical_phase",
      instantiateAgentRun: false,
      reasons: ["lightweight_verification"],
    });
  });

  test("instantiates Verify as an AgentRun for long or independently cancellable verification", () => {
    const decision = decideVerifyInstantiation({
      expectedRoundTrips: 3,
      requiresIndependentCancellation: true,
      requiresUserObservation: true,
      expectedDurationMs: 45_000,
      significantTokenCost: true,
      significantComputeCost: false,
      failureNeedsSeparateReview: true,
    });

    expect(decision).toEqual({
      kind: "agent_run",
      instantiateAgentRun: true,
      roleKind: "subagent",
      roleId: "verify",
      runtimeRole: "verifier",
      reasons: [
        "multi_round_verification",
        "independent_cancellation",
        "user_visible_lifecycle",
        "long_running_verification",
        "significant_token_cost",
        "failure_review_value",
      ],
    });
  });
});
