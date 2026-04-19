# M3 Cross-Provider Validation Report

生成时间：2026-04-18  
生成来源：本地仓库实现状态、provider preset、`bun run typecheck`、`bun test`  
适用范围：M3 OpenAI-compatible provider façade 的本地验证结论  
非权威声明：本文档属于 `generated/` 派生材料，不直接覆盖代码、测试、`CONTROL.md` 或根级文档

## 比较对象

- OpenAI preset
- Groq preset

两者当前都通过同一个 OpenAI-compatible facade 接入，而不是 provider-native adapter。

## 已被 façade / profile 吸收的差异

- `baseURL`
- `apiKeyEnvName`
- `defaultModel`
- `smallModel`
- `unsupportedParams`
- timeout / retry / fallback 统一策略
- usage / latency / error telemetry 统一事件出口

## 本地静态验证结论

- `run-loop` / `control plane` 不需要感知 provider SDK 差异
- `ModelGateway` 已收敛为 façade；OpenAI SDK 调用已移入 `openai-chat-client`
- Provider Profile、Model Selection Policy、Param Filter、Retry Policy、Fallback Policy、Telemetry Schema 都已有单元测试
- `model.telemetry` 已进入稳定 runtime event schema

## 当前 live 验证状态

- OpenAI live validation：未执行
- Groq live validation：未执行
- 阻塞原因：当前环境未提供对应 provider 凭证

## 当前仍然存在但不阻塞 v1 的差异

- 不同 provider 是否完整返回 usage 字段，仍取决于 provider 本身实现
- 不同 provider 对 `response_format` / `stream_options` 的接受度，仍需通过 profile 的 `unsupportedParams` 与 live 校验补充
- 第二 provider 的真实响应稳定性、fallback 行为与 timeout 表面，目前只有本地代码路径验证，没有 live 证据

## 推荐的 live 验证补跑项

在具备凭证后，至少补跑：

- OpenAI `plan / verify / respond`
- Groq `plan / verify / respond`
- streaming
- timeout
- fallback
- usage / latency telemetry
- unsupported params filtering
