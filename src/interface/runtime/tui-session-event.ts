import type { RuntimeSessionState } from "./runtime-session";

export type SessionUpdatedEvent = {
  type: "session.updated";
  payload: RuntimeSessionState;
};

