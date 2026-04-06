export type UtilityPaneMode = "none" | "history" | "sessions" | "settings" | "help";

export type TuiLaunchState = {
  hasCreatedThreadThisLaunch: boolean;
  activeUtilityPane: UtilityPaneMode;
  isCommandMenuOpen: boolean;
};

export function createInitialLaunchState(): TuiLaunchState {
  return {
    hasCreatedThreadThisLaunch: false,
    activeUtilityPane: "none",
    isCommandMenuOpen: false,
  };
}
