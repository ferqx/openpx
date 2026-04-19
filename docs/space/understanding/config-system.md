# Config System

这份文档说明 OpenPX v1 的正式配置系统边界，以及它和运行时、surface、能力目录之间的关系。

## 非兼容原则

OpenPX 当前尚未正式发版，因此配置系统不承担历史配置兼容责任。

这意味着：

- 旧字段形状如果不符合当前 schema，会被直接视为无效配置
- 不提供 `provider.profiles`、`defaultModel`、`smallModel` 等旧结构的迁移投影
- 后续配置演进默认优先保持当前正式结构清晰，而不是为未发版历史数据增加兼容分支

## 一句话定义

OpenPX v1 采用：

- 分层 JSONC 主配置
- provider（提供方定义）+ model slot（模型槽位）+ runtime policy（运行时策略）
- capability 目录发现

主配置负责“选择与策略”，目录负责“能力对象”。

## 四层路径与优先级

OpenPX v1 固定读取 3 层配置：

1. user：
   - Linux / macOS：`~/.openpx/openpx.jsonc`
   - Windows：`%USERPROFILE%\\.openpx\\openpx.jsonc`
2. project：`<workspaceRoot>/.openpx/openpx.jsonc`
3. project-local：`<workspaceRoot>/.openpx/settings.local.jsonc`

当 CLI 第一次实际启动且用户级配置不存在时，系统会自动创建
当前平台对应的用户级 `openpx.jsonc` 骨架文件。
这个骨架文件当前只写注释示例，不会自动写入 `$schema`。

加载顺序是 `user -> project -> project-local`，因此最终优先级是：

- project-local
- project
- user

merge 规则固定如下：

- 标量：后者覆盖前者
- 对象：递归 merge
- 数组：整项替换
- `null`：显式清空

## 主配置负责什么

`openpx.jsonc` / `settings.local.jsonc` 当前只承载 7 个顶级段：

- `$schema`
- `provider`
- `model`
- `runtime`
- `agent`
- `permission`
- `skills`
- `ui`

其中真正接入当前运行链路的是：

- `provider`
- `model.default`
- `model.small`
  `model.small` 可选；若缺省或显式为 `null`，运行时会回落到 `model.default`
- `runtime.thinkingLevel`
- `runtime.timeoutMs`
- `runtime.maxRetries`
- `runtime.enableTelemetry`
- `runtime.enableCostTracking`
- `permission.defaultMode`
- `permission.additionalDirectories`
- `ui.tui.*`

其余字段已经进入 schema、merge 和校验，但不强行提前发明新的 runtime DSL（领域专用语言）。

## capability 目录负责什么

OpenPX v1 同时发现两组 capability 目录：

- 用户级：
  - Linux / macOS：`~/.openpx/{agents,skills,tools}`
  - Windows：`%USERPROFILE%\\.openpx\\{agents,skills,tools}`
- 项目级：`<workspaceRoot>/.openpx/{agents,skills,tools}`

这些目录当前只做：

- 文件发现
- inventory（索引）汇总
- `defaultAgent` 存在性校验

它们还不是新的运行时真相源，也不会绕过 harness protocol（执行基座协议层）直接改变线程状态。

## 与环境变量的关系

OpenPX v1 不再把 `.env` 或 `OPENAI_*` 环境变量当作模型配置来源。

也就是说：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENPX_THINKING`

都不会再驱动 provider / model / thinking 配置。

当前正式规则只有一条：

- provider 的 `apiKey`、`baseURL`
- model 的 `default.provider`、`default.name`、`small.provider`、`small.name`
- runtime 的 `thinkingLevel`

都只从分层 JSONC 主配置读取。

环境变量仍可用于其他运行时辅助项，例如代理地址、数据目录或专门的评测开关；但它们不再参与模型配置解析。

## 与 runtime / surface 的边界

配置系统不进入 harness truth（执行基座真相）。

也就是说：

- 配置不会写进 thread / run / approval / event / ledger
- 配置只影响装配、provider 选择、policy 和 surface 偏好
- TUI 读取的是 `ui.tui` 投影视图，不是另一套独立配置体系

当前默认 TUI settings 已硬迁移到新主配置：

- user scope 写当前平台对应的用户级 `openpx.jsonc`
- project-local scope 写 `<workspaceRoot>/.openpx/settings.local.jsonc`
- project 只读显示来源，不在 settings pane（设置面板）里直接改共享配置

当前仓库仍保留 `schemas/config-v1.json` 作为本地 schema 产物，但在正式 schema 地址可用前，默认不会往配置文件里自动写入 `$schema`。
