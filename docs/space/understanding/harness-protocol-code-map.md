# Harness Protocol 代码对照

这份文档按 endpoint（协议端点）说明 harness protocol 的实现落位。

## `/health`

- router: `src/harness/server/http/runtime-router.ts`
- schema metadata（协议元数据）: `src/harness/protocol/schemas/api-schema.ts`

## `/snapshot`

- router entry（路由入口）: `src/harness/server/http/runtime-router.ts`
- backing service（宿主服务）: `src/harness/server/harness-session-registry.ts`
- session read model（会话读模型）: `src/harness/core/session/harness-session.ts`

## `/commands`

- router entry: `src/harness/server/http/runtime-router.ts`
- payload validation（请求体验证）: `src/harness/protocol/commands/runtime-command-schema.ts`
- command execution（命令执行入口）: `src/harness/server/harness-session-registry.ts`
- core boundary（核心命令边界）: `src/harness/core/session/session-kernel.ts`

## `/events`

- router SSE entry（SSE 路由入口）: `src/harness/server/http/runtime-router.ts`
- event stream source（事件流来源）: `src/harness/server/harness-session-registry.ts`
- live/backlog merge（实时流与回放积压合并）: `src/harness/core/session/harness-session.ts`
