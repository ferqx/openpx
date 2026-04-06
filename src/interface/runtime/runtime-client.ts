import type { RuntimeSnapshot, RuntimeCommand, RuntimeEventEnvelope, ProtocolVersion } from "../../runtime/service/runtime-types";
import type { StreamEvent } from "../../domain/stream-events";
import { dispatchRuntimeRequest } from "../../runtime/service/runtime-http-server";
import { PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from "../../runtime/service/runtime-types";

type RuntimeClientScope = {
  workspaceRoot: string;
  projectId: string;
};

export class RuntimeClient {
  constructor(
    private baseUrl: string,
    private scope?: RuntimeClientScope,
    private protocolVersion: ProtocolVersion = PROTOCOL_VERSION,
  ) {}

  private scopedUrl(path: string, afterSeq?: number): string {
    const url = new URL(path, this.baseUrl);
    if (this.scope) {
      url.searchParams.set("workspaceRoot", this.scope.workspaceRoot);
      url.searchParams.set("projectId", this.scope.projectId);
    }
    if (afterSeq !== undefined) {
      url.searchParams.set("after", afterSeq.toString());
    }
    return url.toString();
  }

  async getSnapshot(): Promise<RuntimeSnapshot> {
    const res = await dispatchRuntimeRequest(this.scopedUrl("/snapshot"), {
      headers: {
        [PROTOCOL_VERSION_HEADER]: this.protocolVersion,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to get snapshot: ${res.statusText}`);
    }
    const snapshot = await res.json() as RuntimeSnapshot;
    this.assertProtocolVersion(snapshot.protocolVersion);
    return snapshot;
  }

  async sendCommand(command: RuntimeCommand): Promise<unknown> {
    const res = await dispatchRuntimeRequest(this.scopedUrl("/commands"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [PROTOCOL_VERSION_HEADER]: this.protocolVersion,
      },
      body: JSON.stringify(command),
    });

    if (!res.ok) {
      let details = res.statusText;
      try {
        const errBody = await res.json() as { error?: string };
        details = errBody.error ?? details;
      } catch {
        // ignore
      }
      throw new Error(`Command Failed (${res.status}): ${details}`);
    }

    return res.json();
  }

  subscribeEvents(afterSeq?: number): AsyncIterable<RuntimeEventEnvelope> {
    const client = this;
    const url = this.scopedUrl("/events", afterSeq);

    return {
      async *[Symbol.asyncIterator]() {
        const res = await dispatchRuntimeRequest(url, {
          headers: {
            [PROTOCOL_VERSION_HEADER]: client.protocolVersion,
          },
        });
        if (!res.ok || !res.body) {
          throw new Error(`Failed to subscribe to events: ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const envelope = JSON.parse(line.slice(6)) as RuntimeEventEnvelope;
                client.assertProtocolVersion(envelope.protocolVersion);
                yield envelope;
              } catch (e) {
                console.error("Failed to parse SSE event", line, e);
              }
            }
          }
        }
      }
    };
  }

  subscribeStreamEvents(afterSeq?: number): AsyncIterable<RuntimeEventEnvelope & { event: StreamEvent }> {
    const client = this;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const envelope of client.subscribeEvents(afterSeq)) {
          if (envelope.event?.type?.startsWith("stream.")) {
            yield envelope as RuntimeEventEnvelope & { event: StreamEvent };
          }
        }
      }
    };
  }

  private assertProtocolVersion(version: string) {
    if (version !== this.protocolVersion) {
      throw new Error(`Protocol version mismatch: expected ${this.protocolVersion}, received ${version}`);
    }
  }
}
