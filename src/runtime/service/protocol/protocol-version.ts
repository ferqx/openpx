import { z } from "zod";

export const supportedProtocolVersions = [
  "1.0.0",
] as const;

export const protocolVersionSchema = z.enum(supportedProtocolVersions);

export type ProtocolVersion = z.infer<typeof protocolVersionSchema>;

export const CURRENT_PROTOCOL_VERSION: ProtocolVersion = "1.0.0";
export const DEFAULT_PROTOCOL_VERSION: ProtocolVersion = CURRENT_PROTOCOL_VERSION;
export const PROTOCOL_VERSION_HEADER = "x-openpx-protocol-version";

export function isSupportedProtocolVersion(value: string): value is ProtocolVersion {
  return (supportedProtocolVersions as readonly string[]).includes(value);
}

