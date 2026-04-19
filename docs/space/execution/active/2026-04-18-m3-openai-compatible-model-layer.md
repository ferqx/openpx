# M3：OpenAI-Compatible Model Layer & Cost

## 目标

把 OpenPX 当前的 OpenAI SDK 直连模型层收敛成稳定的 OpenAI-compatible 接入层：

- `ModelGateway` 作为 OpenAI Chat facade（OpenAI Chat 门面层）
- provider 通过 profile + `baseURL` + model selection（模型选择）接入
- usage / cost / latency / error / fallback 进入正式观测路径
- `run-loop`、`control plane`、恢复与审计语义不感知 provider 差异

## 非目标

本计划明确不做：

- OpenAI Responses API
- Anthropic native / Gemini native 协议
- 跨协议 tool-calling 抽象
- provider-native adapter zoo
- 大而全模型注册中心
- 新 UI dashboard

## 影响范围

- `src/infra/model-gateway.ts` 与 `src/infra/provider/*`
- `src/shared/config.ts`
- `src/app/smoke-planner.ts`
- `src/surfaces/tui/*` 中展示模型信息的入口
- runtime event schema / event bus
- 根级文档与 `.env.example`

## 执行顺序

1. 冻结 M3 文档边界：只做 OpenAI Chat Completions compatible 路线，并把稳定术语回写到根级文档。
2. 引入 provider profile / model selection policy / retry policy / fallback policy / telemetry schema。
3. 抽出 `openai-chat-client`，把 `ModelGateway` 收敛成 façade，不再直接持有 SDK 细节。
4. 接入 `model.telemetry`，保留现有 `model.*` 事件兼容。
5. 切到 profile-first 配置入口，并让 smoke/TUI/real-eval 消费解析后的 profile。
6. 以 `groq` 作为第二个 OpenAI-compatible provider 做最小连通性与差异验证。

## 验证方式

- `bun run typecheck`
- `bun test tests/infra/provider-profile.test.ts tests/infra/model-gateway.test.ts tests/app/smoke-planner.test.ts`
- `bun test tests/runtime/runtime-protocol-schema.test.ts`
- `bun test`

必要时再补 env-gated 真实 provider 验证：

- OpenAI preset
- Groq preset
- `plan / verify / respond`
- streaming / timeout / fallback / telemetry / unsupported params filtering

## 完成标准

- `ModelGateway` 不再直接堆积 OpenAI SDK 调用细节
- Provider Profile 已成为正式配置入口
- `defaultModel + smallModel` 已进入主路径
- `model.telemetry` 已进入 runtime 稳定事件集合
- `run-loop` / `control plane` 不需要感知 provider 差异
- 根级文档、active 计划与实现一致
