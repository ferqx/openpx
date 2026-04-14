// runtime types 是 service 层对外协议的汇总出口：
// 统一从 api-schema 与 protocol-version 重新导出，避免调用方分散依赖内部文件结构。
export * from "./api-schema";
export * from "./protocol/protocol-version";

export { CURRENT_PROTOCOL_VERSION as PROTOCOL_VERSION } from "./protocol/protocol-version";
