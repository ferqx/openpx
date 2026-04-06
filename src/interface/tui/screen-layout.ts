import type { UtilityPaneMode } from "./view-state";
import type { SessionStage } from "../runtime/runtime-session";

export type ScreenLayout = {
  hasOverlayPane: boolean;
  overlayRows: number;
  useAdaptiveWelcomeHeight: boolean;
};

export function computeScreenLayout(input: {
  terminalRows: number;
  showThreadPanel?: boolean;
  activeUtilityPane?: UtilityPaneMode;
  composerMode?: "input" | "confirm" | "blocked";
  recommendationReason?: string;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
  stage?: SessionStage;
  showWelcome?: boolean;
}): ScreenLayout {
  const headerRows = 0;
  const threadPanelRows = input.showThreadPanel ? 4 : 0;
  const statusRows = 1;
  const overlayRows =
    input.activeUtilityPane === "settings"
      ? Math.max(16, input.terminalRows - (headerRows + threadPanelRows + statusRows + 6))
      : input.activeUtilityPane && input.activeUtilityPane !== "none"
        ? 10
        : 0;
  const hasOverlayPane = Boolean(input.activeUtilityPane && input.activeUtilityPane !== "none");
  const useAdaptiveWelcomeHeight = Boolean(input.showWelcome && !hasOverlayPane);

  return {
    hasOverlayPane,
    overlayRows,
    useAdaptiveWelcomeHeight,
  };
}
