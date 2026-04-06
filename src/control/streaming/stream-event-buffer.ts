import type { StreamEvent } from "../../domain/stream-events";

const MAX_EVENTS_PER_TURN = 500;
const MAX_TURNS = 50;
const CLEANUP_DELAY_MS = 5 * 60 * 1000;

class RingBuffer<T> {
  private items: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.maxSize) {
      this.items = this.items.slice(-this.maxSize);
    }
  }

  filterAfter(seq: number, getSeq: (item: T) => number): T[] {
    return this.items.filter(item => getSeq(item) > seq);
  }

  get length(): number {
    return this.items.length;
  }
}

type TurnEntry = {
  buffer: RingBuffer<StreamEvent>;
  lastActiveAt: number;
  isDone: boolean;
  doneAt?: number;
};

export class StreamEventBuffer {
  private turns = new Map<string, TurnEntry>();
  private globalSeq = 0;

  push(event: StreamEvent): void {
    let entry = this.turns.get(event.turnId);
    if (!entry) {
      this.evictIfNeeded();
      entry = {
        buffer: new RingBuffer(MAX_EVENTS_PER_TURN),
        lastActiveAt: Date.now(),
        isDone: false,
      };
      this.turns.set(event.turnId, entry);
    }

    const eventWithSeq = { ...event, seq: ++this.globalSeq };
    entry.buffer.push(eventWithSeq);
    entry.lastActiveAt = Date.now();

    if (event.type === "stream.done") {
      entry.isDone = true;
      entry.doneAt = Date.now();
      this.scheduleCleanup(event.turnId);
    }
  }

  resume(turnId: string, lastSeq: number): StreamEvent[] {
    const entry = this.turns.get(turnId);
    if (!entry) return [];
    return entry.buffer.filterAfter(lastSeq, e => e.seq);
  }

  resumeAll(lastSeq: number): StreamEvent[] {
    const all: StreamEvent[] = [];
    for (const entry of this.turns.values()) {
      all.push(...entry.buffer.filterAfter(lastSeq, e => e.seq));
    }
    return all.sort((a, b) => a.seq - b.seq);
  }

  cleanup(turnId: string): void {
    this.turns.delete(turnId);
  }

  private evictIfNeeded(): void {
    if (this.turns.size < MAX_TURNS) return;

    const candidates = [...this.turns.entries()]
      .filter(([, entry]) => entry.isDone)
      .sort(([, a], [, b]) => (a.doneAt ?? 0) - (b.doneAt ?? 0));

    if (candidates.length > 0) {
      const first = candidates[0];
      if (first) {
        this.turns.delete(first[0]);
      }
    }
  }

  private scheduleCleanup(turnId: string): void {
    setTimeout(() => {
      const entry = this.turns.get(turnId);
      if (entry?.isDone) {
        this.turns.delete(turnId);
      }
    }, CLEANUP_DELAY_MS);
  }
}
