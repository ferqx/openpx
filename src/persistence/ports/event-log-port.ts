import type { Event } from "../../domain/event";
import type { StoragePort } from "./storage-port";

/** 事件日志端口：按线程追加并顺序回放 durable event */
export interface EventLogPort extends StoragePort {
  append(event: Event): Promise<void>;
  listByThread(threadId: string): Promise<Event[]>;
  listByThreadAfter(threadId: string, seq: number): Promise<Event[]>;
}
