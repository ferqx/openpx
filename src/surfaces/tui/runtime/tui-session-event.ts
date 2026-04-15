import type { RuntimeSessionState } from "./runtime-session";

/** TUI 侧会话更新事件：session-sync 层用于广播最新归一化会话状态 */
export type SessionUpdatedEvent = {
  type: "session.updated";
  payload: RuntimeSessionState;
};
