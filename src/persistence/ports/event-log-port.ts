import type { Event } from "../../domain/event";
import type { StoragePort } from "./storage-port";

export interface EventLogPort extends StoragePort {
  append(event: Event): Promise<void>;
  listByThread(threadId: string): Promise<Event[]>;
}
