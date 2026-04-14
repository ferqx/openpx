/** utility pane 模式：none/history/sessions/settings/help */
export type UtilityPaneMode = "none" | "history" | "sessions" | "settings" | "help";

/** 启动态只保存本次 launch 的本地 UI 真相，不写回 runtime */
export type TuiLaunchState = {
  hasCreatedThreadThisLaunch: boolean;
  activeUtilityPane: UtilityPaneMode;
  isCommandMenuOpen: boolean;
};

/** 创建 launch 级别的初始 UI 状态 */
export function createInitialLaunchState(): TuiLaunchState {
  return {
    hasCreatedThreadThisLaunch: false,
    activeUtilityPane: "none",
    isCommandMenuOpen: false,
  };
}
