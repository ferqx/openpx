import { describe, expect, test } from "bun:test";
import { computeScreenLayout } from "../../src/surfaces/tui/screen-layout";

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
      conversationRows: 20,
      hasOverlayPane: false,
      overlayRows: 0,
      useAdaptiveWelcomeHeight: true,
    });
  });

  test("reserves overlay rows for settings", () => {
    const layout = computeScreenLayout({
      terminalRows: 30,
      activeUtilityPane: "settings",
      composerMode: "input",
      showThreadPanel: true,
      showWelcome: false,
    });

    expect(layout.hasOverlayPane).toBe(true);
    expect(layout.overlayRows).toBeGreaterThanOrEqual(16);
    expect(layout.conversationRows).toBeGreaterThanOrEqual(6);
    expect(layout.useAdaptiveWelcomeHeight).toBe(false);
  });
});
