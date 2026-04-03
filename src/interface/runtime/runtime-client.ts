import type { RuntimeSnapshot, RuntimeCommand, RuntimeEventEnvelope } from "../../runtime/service/runtime-types";

export class RuntimeClient {
  constructor(private baseUrl: string) {}

  async getSnapshot(): Promise<RuntimeSnapshot> {
    const res = await fetch(`${this.baseUrl}/snapshot`);
    if (!res.ok) {
      throw new Error(`Failed to get snapshot: ${res.statusText}`);
    }
    return res.json() as Promise<RuntimeSnapshot>;
  }

  async sendCommand(command: RuntimeCommand): Promise<void> {
    const res = await fetch(`${this.baseUrl}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      throw new Error(`Failed to send command: ${res.statusText}`);
    }
  }

  subscribeEvents(afterSeq?: number): AsyncIterable<RuntimeEventEnvelope> {
    const url = new URL(`${this.baseUrl}/events`);
    if (afterSeq !== undefined) {
      url.searchParams.set("after", afterSeq.toString());
    }

    return {
      async *[Symbol.asyncIterator]() {
        const res = await fetch(url.toString());
        if (!res.ok || !res.body) {
          throw new Error(`Failed to subscribe to events: ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              yield JSON.parse(line.slice(6));
            }
          }
        }
      }
    };
  }
}
