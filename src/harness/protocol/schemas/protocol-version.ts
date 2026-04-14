import { z } from "zod";

/** 当前支持的 harness protocol 协议版本列表 */
export const supportedProtocolVersions = [
  "1.0.0",
] as const;

export const protocolVersionSchema = z.enum(supportedProtocolVersions);

export type ProtocolVersion = z.infer<typeof protocolVersionSchema>;

export const CURRENT_PROTOCOL_VERSION: ProtocolVersion = "1.0.0";
export const DEFAULT_PROTOCOL_VERSION: ProtocolVersion = CURRENT_PROTOCOL_VERSION;
export const PROTOCOL_VERSION_HEADER = "x-openpx-protocol-version";

/** 判断传入版本是否受支持 */
export function isSupportedProtocolVersion(value: string): value is ProtocolVersion {
  return (supportedProtocolVersions as readonly string[]).includes(value);
}
