import { describe, expect, test } from "bun:test";
import { getSubagentSpec, listSubagentSpecs } from "../../src/control/agents/subagent-registry";

describe("Subagent registry contract", () => {
  test("exposes the four stable subagent contracts with policy fields", () => {
    expect(listSubagentSpecs()).toEqual([
      {
        id: "explore",
        label: "Explore",
        description: "面向信息收集与代码探索的子代理合同。",
        permissionPolicy: "readonly_search",
        visibilityPolicy: "hidden",
        invocationPolicy: "automatic_only",
        costLabel: "explore",
      },
      {
        id: "verify",
        label: "Verify",
        description: "面向验证、检查与回归确认的子代理合同。",
        permissionPolicy: "verification_only",
        visibilityPolicy: "visible_when_instance",
        invocationPolicy: "hybrid",
        costLabel: "verify",
      },
      {
        id: "review",
        label: "Review",
        description: "面向审阅、评估与风险识别的子代理合同。",
        permissionPolicy: "readonly_review",
        visibilityPolicy: "hidden",
        invocationPolicy: "automatic_only",
        costLabel: "review",
      },
      {
        id: "general",
        label: "General",
        description: "兜底型通用子代理合同。",
        permissionPolicy: "inherited_minimum",
        visibilityPolicy: "hidden",
        invocationPolicy: "automatic_only",
        costLabel: "general",
      },
    ]);
  });

  test("returns Verify as the visible hybrid verification contract", () => {
    expect(getSubagentSpec("verify")).toMatchObject({
      permissionPolicy: "verification_only",
      visibilityPolicy: "visible_when_instance",
      invocationPolicy: "hybrid",
      costLabel: "verify",
    });
  });
});
