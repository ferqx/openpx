# 规格说明书：TUI `/plan`、命令提示与 Settings 设计

Date: 2026-04-06
Status: Historical
Superseded by:
- `ROADMAP.md`
- `docs/superpowers/specs/2026-04-06-agent-os-reset-design.md`
- `docs/superpowers/plans/2026-04-06-agent-os-reset-plan.md`

## Reset Notice

This design is retained as later-stage product/UI exploration and is not part of the current implementation priority path.

## 1. 背景

TUI v1 shell 已经具备欢迎页、单线程主流、slash command 基础入口、utility panes、approval 输入语义和 `Esc` 中断链。下一步需要补齐两个高频入口能力：

1. `/plan` 不再只是文本前缀约定，而是一个明确的“规划型任务入口”
2. `settings` 不再只是占位信息页，而是一个可交互的本地配置编辑器

同时，slash command 的输入体验需要升级：当用户在输入框区域键入 `/` 时，TUI 应即时展示命令提示，而不是要求用户记住完整命令。

## 2. 设计目标

- `/plan` 明确表达“先规划、后执行”的任务意图
- TUI 清楚表达当前任务阶段，但不把决策权从内核拿到前端
- slash command 支持输入时的实时命令提示
- `settings` 支持交互式编辑并持久化到本地 JSON 配置
- 配置支持 `Global` 默认层和 `Project` 覆盖层

## 3. `/plan` 的语义

### 3.1 `/plan` 不是长期前端 mode

`/plan` 不应被实现成“用户进入一个长期驻留的前端规划模式，并手动退出”的 UI mode。这样会把任务编排和流程推进错误地下放到 TUI 层。

正确语义应当是：

- `/plan` 是一个规划型任务入口
- 内核接收到规划意图后，先进入规划流程
- 规划过程中，内核逐步输出方案、确认点和下一步
- 规划完成后，内核自动转入执行
- TUI 只负责表达当前阶段，不负责决定何时退出规划

### 3.2 阶段表达

虽然 `/plan` 不是长期前端 mode，但 TUI 必须明确表达当前处于什么阶段。

至少需要区分：

- `planning`
- `awaiting_confirmation`
- `executing`
- `blocked`

阶段表达应该是轻量、常驻且不打扰主流的，例如：

- Header 中的阶段标签
- Composer 上方的一行状态说明
- Status 区域中的当前阶段项

### 3.3 内核责任

TUI 发出 `/plan` 后，内核需要负责：

- 将输入识别为 planning intent
- 先产出方案
- 在关键节点收用户确认
- 在适当时机自动转执行

因此，TUI 不应仅仅把 `/plan foo` 改写成一段字符串前缀，而应向内核发出明确的 planning 入口语义。

## 4. Slash Command 命令提示

### 4.1 触发条件

当输入框当前输入以 `/` 开头时，TUI 进入命令提示态。

这意味着：

- 输入第一个 `/` 时，立即展示可用命令列表
- 继续输入时，对命令列表做实时过滤
- 不需要等用户按回车后才解析命令

### 4.2 展现形式

命令提示采用输入框下方的下拉列表，而不是覆盖主视图的 command palette。

原因：

- 更符合 CLI/TUI 的连续输入体验
- 不抢主视图
- 能和普通输入自然衔接

### 4.3 交互规则

命令提示需要支持：

- 实时过滤
- 当前选中项高亮
- 上下方向键切换选项
- `Enter` 选中命令
- `Esc` 退出提示态

对于支持参数的命令，例如 `/plan`：

- 选中 `/plan` 后，不应直接执行
- 而应将输入框内容补全为 `/plan `
- 用户继续补充参数，然后再提交

对于无参数命令，例如 `/help`、`/sessions`：

- 选中并回车后即可立即执行

### 4.4 首批命令列表

首批参与命令提示的命令包括：

- `/new`
- `/plan`
- `/history`
- `/sessions`
- `/clear`
- `/settings`
- `/help`

## 5. Settings 的语义

### 5.1 Settings 是配置编辑器，不是信息面板

`settings` 应被定义成一个可交互的本地配置编辑器，而不是只读状态页。

它的职责是：

- 浏览配置项
- 搜索配置项
- 修改配置项
- 显式保存
- 写回本地配置文件

### 5.2 界面结构

`settings` 采用类似以下结构：

- 顶部标签：`Status | Config | Usage`
- 默认聚焦 `Config`
- 中间是可搜索的配置列表
- 底部是操作提示

交互提示遵循：

- `Space` 切换 boolean 配置
- `Enter` 保存
- `/` 进入搜索
- `Esc` 取消并返回

### 5.3 Settings 的三块内容

#### `Status`

显示当前运行态，不直接编辑：

- 当前模型
- 当前 thinking 配置
- 当前 workspace
- 当前 thread 状态
- 当前任务阶段，例如 `planning / approval / executing / blocked`

#### `Config`

显示可编辑配置项，类似：

- Auto-compact
- Show tips
- Reduce motion
- Thinking mode
- Prompt suggestions
- Verbose output
- Terminal progress bar

后续可以扩展成：

- boolean
- enum
- action

但第一版以 boolean 和少量 enum 为主。

#### `Usage`

显示操作说明和语义说明：

- slash commands
- 快捷键
- `/plan` 的行为
- approval / blocked 的含义
- settings 的搜索、切换、保存方式

## 6. 配置持久化模型

### 6.1 JSON 格式

配置持久化使用 JSON。

原因：

- 用户已明确指定 JSON
- 解析和写回简单
- 适合 TUI 内部读写

### 6.2 Global 与 Project 两层配置

配置采用两层覆盖模型：

- `Global` 用户配置：默认层
- `Project` 项目配置：当前 workspace 覆盖层

生效规则是：

`Project > Global`

### 6.3 默认编辑层

Settings 默认编辑 `Global` 用户配置，并提供进入 `Project` 配置的明确入口。

原因：

- 默认路径简单
- 用户更容易建立“这是我的主偏好”心智模型
- 仍保留对当前 workspace 的局部定制能力

### 6.4 生效值展示

尽管默认编辑的是 `Global`，TUI 仍应让用户理解一个配置值最终来自哪一层。

第一版至少要支持：

- 展示当前正在编辑的是 `Global` 还是 `Project`
- 在 Project 未覆盖时，明确该值继承自 Global

## 7. 文件与边界建议

### 7.1 `/plan`

- TUI 侧需要一个明确的 planning submit path
- runtime/kernel 侧需要一个 planning intent，而不是简单字符串约定
- `Status` 或主界面中需要能消费“当前阶段”

### 7.2 Command Suggestion

- Composer 需要引入 command suggestion 子状态
- 需要一个命令定义表，包含：
  - 命令名
  - 是否支持参数
  - 描述

### 7.3 Settings

- 需要一个本地配置读取/写入模块
- 需要区分 global config path 与 project config path
- TUI 中需要一个独立的 settings pane / screen 状态机

## 8. 非目标

这一轮明确不做：

- 完整命令 palette 覆盖主视图
- 任意层级的复杂配置 schema 编辑器
- 所有配置项立即热更新到 runtime 内部实现
- 多线程配置视图

## 9. 验收标准

- [ ] `/plan` 走明确的 planning intent，而不是纯字符串前缀 hack
- [ ] TUI 能表达当前处于 planning / awaiting_confirmation / executing / blocked 阶段
- [ ] 输入 `/` 时会出现命令提示下拉
- [ ] 命令提示支持过滤、选择和参数命令补全
- [ ] `settings` 支持浏览、搜索、切换、保存
- [ ] 配置以 JSON 持久化
- [ ] 默认编辑 `Global`，并提供 `Project` 配置入口
- [ ] 最终生效值遵循 `Project > Global`
