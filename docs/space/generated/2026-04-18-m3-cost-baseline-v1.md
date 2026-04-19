# M3 Cost Baseline v1

生成时间：2026-04-18  
生成来源：本地仓库实现状态、`bun run typecheck`、`bun test`  
适用范围：M3 OpenAI-compatible model layer 的本地代码就绪度与基线采集位点  
非权威声明：本文档属于 `generated/` 派生材料，不直接覆盖代码、测试、`CONTROL.md` 或根级文档

## 当前结论

- M3 已具备正式的 provider telemetry 事件：`model.telemetry`
- telemetry 字段已覆盖 `providerId`、`baseURL`、`model`、`operation`、`inputTokens`、`outputTokens`、`waitDuration`、`genDuration`、`totalDuration`、`status`、`errorKind`、`fallbackCount`
- `plan / verify / respond` 三类 operation 已接入统一的 timeout / retry / fallback 控制面
- 本地自动化验证已证明 telemetry schema、gateway 事件流、runtime protocol schema、smoke-planner 与完整测试套件通过

## 当前缺口

- 当前环境未提供 OpenAI / Groq 的 live provider 凭证
- 因此本次无法产出真实 token 均值、真实 fallback rate、真实 timeout rate 与真实 provider error rate 的数值基线

## live 基线采集建议

当环境具备对应凭证后，按下面顺序补采：

```bash
bun run typecheck
bun test
bun run smoke:planner
```

建议至少记录以下维度：

- `plan` 的 input/output tokens、waitDuration、genDuration
- `verify` 的 input/output tokens、waitDuration、genDuration
- `respond` 的 input/output tokens、waitDuration、genDuration
- fallback rate
- timeout rate
- provider error rate

## 当前本地证据

- `bun run typecheck`：通过
- `bun test`：通过
- `tests/infra/provider-profile.test.ts`：覆盖 telemetry normalization
- `tests/infra/model-gateway.test.ts`：覆盖 gateway 事件流里的 `model.telemetry`
- `tests/runtime/runtime-protocol-schema.test.ts`：覆盖 `model.telemetry` 进入稳定 runtime event schema
