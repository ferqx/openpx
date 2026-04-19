import type { UtilityPaneMode } from "./view-state";
import type { SessionStage } from "./runtime/runtime-session";

/** Screen 布局结果：告诉渲染层是否有 overlay，以及预留多少行 */
export type ScreenLayout = {
  hasOverlayPane: boolean;
  overlayRows: number;
  useAdaptiveWelcomeHeight: boolean;
};

/** 根据终端尺寸与当前 UI 状态计算屏幕布局 */
export function computeScreenLayout(input: {
  terminalRows: number;
  showThreadPanel?: boolean;
  activeUtilityPane?: UtilityPaneMode;
  composerMode?: "input" | "confirm" | "blocked";
  recommendationReason?: string;
  blockingReason?: {
    kind: "waiting_approval" | "plan_decision" | "human_recovery";
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
      // settings pane 通常更高，需要尽量吃满剩余终端高度。
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
