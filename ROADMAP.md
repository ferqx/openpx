# OpenPX Roadmap

## One-line definition

OpenPX 是一个面向长时代码工作的本地 Agent OS。  
**Runtime 是唯一真相源；TUI 是 shell，不是第二套状态机。**

---

## Current stage

OpenPX 当前阶段不是继续扩功能，也不是优先推进多前端产品化。  
当前阶段是：

1. 补齐 graph-backed execution loop
2. 收紧 runtime truth boundaries
3. 让 TUI 退回到 protocol consumer
4. 在此基础上做 hardening 与最小产品化

---

## Product direction

### What OpenPX is

OpenPX 应该成为：

- 一个本地、可恢复、可中断、可继续的 agent runtime
- 一个面向长任务执行的 control plane
- 一个以 protocol / snapshot / event stream 为核心的系统
- 一个 TUI-first、CLI-first 的工作壳层

### What OpenPX is not

当前阶段，OpenPX 不是：

- 一个以 shell polish 为核心的终端 UI 项目
- 一个优先追求多前端接入的产品
- 一个把业务真相分散在 TUI、session state、runtime helper 中的系统
- 一个在执行闭环未完成前先做“看起来完整”的项目

---

## Guiding principles

### 1. Runtime owns truth

所有用户可见状态都应来自 runtime protocol、snapshot 和 event stream。  
TUI 只负责展示和交互，不负责发明业务语义。

### 2. One execution model

planner、executor、verifier、approval、reject、resume、artifact、phase commit  
必须走同一条 graph-backed 执行路径。  
避免 control-plane shortcut 与 graph path 并存。

### 3. Stable protocol first

先稳定 thread / task / approval / answer / worker / command / event / snapshot protocol，  
再做外层体验优化。

### 4. Thin shell

TUI 是 shell，不是 runtime 的复制品。  
UI 层只保留最小必要的本地交互状态。

### 5. Productization is downstream

只有在执行闭环和 runtime truth boundaries 收紧之后，  
才进入 release、onboarding、VSCode / Web 等产品化工作。

---

## Priority order

固定优先级如下：

1. 执行闭环
2. runtime truth 收口
3. hardening
4. productization

除非出现阻塞性问题，不在前两项未完成前插入新的产品化主线。

---

## Milestones

## M1 — Complete the execution loop

目标：让核心执行流程完全闭环，且所有关键路径走统一 graph 模型。

### Scope

- active work package context
- current package artifact flow
- approval resume artifact execution
- rejection resume graph flow
- executor / verifier 绑定 active work package
- artifact 输出严格基于 current package

### Exit criteria

- approve / reject 都能通过 graph resume 回到统一执行模型
- executor / verifier 的上下文来源一致
- artifact 不再泄漏旧 package 状态
- phase commit 清理 package-local transient state
- 相关 runtime / graph / approval 测试通过

### Non-goals

- 大规模 UI 重构
- 多前端支持
- 对外产品 packaging

---

## M2 — Make runtime the only source of truth

目标：完成 reset 的核心收口，让 runtime truth boundaries 清晰可验证。

### Scope

- snapshot / event / view protocol 稳定
- session derivation 完全从 runtime state 派生
- worker lifecycle 统一进入 protocol
- pending approvals / answers / tasks / runs 的显示语义从 runtime view 得出
- 移除 TUI 层的业务真相拼装逻辑

### Exit criteria

- TUI 只消费 stable view objects
- 不再由 TUI 合成 canonical task / approval / answer truth
- runtime-session 成为唯一会话语义转换点
- runtime / kernel / interface 边界清晰
- hydration 与 replay 能得到同一可见状态

### Non-goals

- UI 视觉优化
- 新交互模式扩展
- Desktop / Web frontend

---

## M3 — Hardening

目标：在核心模型稳定后，提高系统的可靠性和恢复能力。

### Scope

- daemon reuse / reconnect / restart recovery
- hydrate / replay / interrupt / resume 稳定性
- 多 workspace / session reuse 语义明确
- regression suite 整理与稳定
- smoke path 稳定

### Exit criteria

- 关键恢复路径具备自动化测试覆盖
- runtime daemon 生命周期行为可预测
- restart 后 session hydration 可复现
- reconnect 不引入第二套 runtime truth
- 常见异常路径可恢复

### Non-goals

- 新功能扩张
- 多端接入探索
- 复杂插件体系

---

## M4 — Productization

目标：在 runtime 和 shell 边界稳定后，再推进用户层产品化。

### Scope

- CLI onboarding / quickstart
- 默认配置与本地开发体验
- release checklist
- 文档体系整理
- 在不破坏 runtime truth model 的前提下评估 VSCode / Web / Desktop 接入

### Exit criteria

- 本地安装与启动路径清晰
- 核心 smoke workflow 可复现
- 对外发布最小可用版本
- 多前端探索不破坏核心 runtime model

### Non-goals

- 为了多前端而回退 runtime 边界设计
- 为了演示效果而引入第二套状态真相

---

## Current work packages

当前迭代只维护少量活跃 work packages：

- active work package worker context
- current package artifact flow
- approval resume artifact execution
- rejection resume graph flow
- runtime view simplification for TUI consumption
- daemon reuse / recovery verification

每个 work package 都应满足：

- 只解决一个主问题
- 明确写出 touched files
- 明确测试计划
- 明确 exit criteria
- 完成后能减少系统中“第二套真相”的存在

---

## Decision rules

遇到实现分歧时，按下面规则判断：

### Prefer runtime truth over UI convenience

只要某个方案会让 TUI 拥有业务真相，就不选它。  
即使短期更快，也应回到 runtime protocol 侧解决。

### Prefer one explicit path over two partial paths

若 graph path 与 shortcut path 并存，优先删掉 shortcut。  
系统应只有一条权威执行路径。

### Prefer stable views over ad-hoc derivation

凡是可以在 runtime 内形成 stable view 的，不放到外层临时拼装。

### Prefer fewer active documents

同一主题只能有一个 active baseline。  
旧方案保留为 historical，不与当前主线竞争。

---

## Documentation policy

文档分为三类：

### Active

当前开发必须遵循的文档。  
每个主题只能有一个 active baseline。

### Work package

短周期执行文档。  
服务于当前 milestone，完成后应被吸收到 active design 或归档。

### Historical

历史方案、被 supersede 的设计、阶段性探索记录。  
保留参考价值，但不作为当前实现依据。

---

## Non-goals right now

以下内容当前不作为主线目标：

- 为了展示效果优先做 UI polish
- 为了多端接入提前抽象 frontend API
- 在 runtime truth 未稳定前推进复杂插件体系
- 在执行闭环未完成前扩大功能面
- 同时维护多份互相竞争的 roadmap / reset / redesign 文档

---

## What success looks like

当下面这些事情成立时，说明 OpenPX 进入了下一阶段：

- planner → executor / verifier → approval / reject → resume → artifact → commit 是一条统一的执行链
- runtime snapshot / event / protocol 构成唯一真相源
- TUI 只消费 stable views，不再承载业务拼装逻辑
- interrupt / replay / recovery 具备可靠性
- 在此基础上，CLI 与后续前端产品化可以安全推进

---

## Short version

OpenPX 的近期目标不是“做更多”，而是“收得更准”。

先把：

- 执行闭环打通
- runtime truth 收紧
- TUI 变薄
- 恢复能力做稳

然后再做：

- 发布
- onboarding
- 多前端产品化
