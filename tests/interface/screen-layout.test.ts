import { describe, expect, test } from "bun:test";
import { computeScreenLayout } from "../../src/interface/tui/screen-layout";

describe("screen layout", () => {
  test("computes adaptive welcome layout without overlays", () => {
    expect(
      computeScreenLayout({
        terminalRows: 24,
        showWelcome: true,
        activeUtilityPane: "none",
        composerMode: "input",
      }),
    ).toEqual({
      hasOverlayPane: false,
      overlayRows: 0,
      mainHeight: 19,
      useAdaptiveWelcomeHeight: true,
    });
  });

  test("reserves overlay rows for settings and blocked states", () => {
    const layout = computeScreenLayout({
      terminalRows: 30,
      activeUtilityPane: "settings",
      composerMode: "blocked",
      blockingReason: { kind: "human_recovery", message: "Inspect workspace" },
      showThreadPanel: true,
      showWelcome: false,
    });

    expect(layout.hasOverlayPane).toBe(true);
    expect(layout.overlayRows).toBeGreaterThanOrEqual(16);
    expect(layout.useAdaptiveWelcomeHeight).toBe(false);
    expect(layout.mainHeight).toBeGreaterThanOrEqual(6);
  });
});
