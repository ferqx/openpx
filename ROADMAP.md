# OpenPX 路线图

## 一句话定义

OpenPX 是一个面向长时代码工作的本地 Agent OS。  
**Runtime 是唯一真相源；TUI 是 shell，不是第二套状态机。**

---

## 当前阶段

OpenPX 当前阶段不是继续扩功能，也不是优先推进多前端产品化。  
当前阶段是：

1. 补齐 graph-backed execution loop
2. 收紧 runtime truth boundaries
3. 让 TUI 退回到 protocol consumer
4. 在此基础上做 hardening 与最小产品化

### 当前恢复执行状态

这一轮仓库恢复已经完成到以下程度：

- 理解面恢复：已完成
- 状态流与界面映射恢复：已完成
- 代码复杂度收口：进行中，但主入口与主界面的第一轮减法已经完成
- 结构减法执行：进行中，下一优先级转向 `session-kernel` 与 runtime service 边界

这意味着接下来的工作不再是“重新建立基本理解”，而是沿着已经确认的主轴继续做受控减法。

---

## 产品方向

### OpenPX 应该是什么

OpenPX 应该成为：

- 一个本地、可恢复、可中断、可继续的 agent runtime
- 一个面向长任务执行的 control plane
- 一个以 protocol / snapshot / event stream 为核心的系统
- 一个 TUI-first、CLI-first 的工作壳层

### OpenPX 应该不是什么

当前阶段，OpenPX 不是：

- 一个以 shell polish 为核心的终端 UI 项目
- 一个优先追求多前端接入的产品
- 一个把业务真相分散在 TUI、session state、runtime helper 中的系统
- 一个在执行闭环未完成前先做"看起来完整"的项目

---

## 指导原则

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

## 优先级顺序

固定优先级如下：

1. 执行闭环
2. runtime truth 收口
3. hardening
4. productization

除非出现阻塞性问题，不在前两项未完成前插入新的产品化主线。

---

## 里程碑

## M1 — 完成执行循环

目标：让核心执行流程完全闭环，且所有关键路径走统一 graph 模型。

### 范围

- active work package context
- current package artifact flow
- approval resume artifact execution
- rejection resume graph flow
- executor / verifier 绑定 active work package
- artifact 输出严格基于 current package

### 退出标准

- approve / reject 都能通过 graph resume 回到统一执行模型
- executor / verifier 的上下文来源一致
- artifact 不再泄漏旧 package 状态
- phase commit 清理 package-local transient state
- 相关 runtime / graph / approval 测试通过

### 非目标

- 大规模 UI 重构
- 多前端支持
- 对外产品 packaging

---

## M2 — 让 runtime 成为唯一真相源

目标：完成 reset 的核心收口，让 runtime truth boundaries 清晰可验证。

### 范围

- snapshot / event / view protocol 稳定
- session derivation 完全从 runtime state 派生
- worker lifecycle 统一进入 protocol
- pending approvals / answers / tasks / runs 的显示语义从 runtime view 得出
- 移除 TUI 层的业务真相拼装逻辑

### 退出标准

- TUI 只消费 stable view objects
- 不再由 TUI 合成 canonical task / approval / answer truth
- runtime-session 成为唯一会话语义转换点
- runtime / kernel / interface 边界清晰
- hydration 与 replay 能得���同一可见状态

### 非目标

- UI 视觉优化
- 新交互模式扩展
- Desktop / Web frontend

---

## M3 — 可靠性加固

目标：在核心模型稳定后，提高系统的可靠性和恢复能力。

### 范围

- daemon reuse / reconnect / restart recovery
- hydrate / replay / interrupt / resume 稳定性
- 多 workspace / session reuse 语义明确
- regression suite 整理与稳定
- smoke path 稳定

### 退出标准

- 关键恢复路径具备自动化测试覆盖
- runtime daemon 生命周期行为可预测
- restart 后 session hydration 可复现
- reconnect 不引入第二套 runtime truth
- 常见异常路径可恢复

### 非目标

- 新功能扩张
- 多端接入探索
- 复杂插件体系

---

## M4 — 产品化

目标：在 runtime 和 shell 边界稳定后，再推进用户层产品化。

### 范围

- CLI onboarding / quickstart
- 默认配置与本地开发体验
- release checklist
- 文档体系整理
- 在不破坏 runtime truth model 的前提下评估 VSCode / Web / Desktop 接入

### 退出标准

- 本地安装与启动路径清晰
- 核心 smoke workflow 可复现
- 对外发布最小可用版本
- 多前端探索不破坏核心 runtime model

### 非目标

- 为了多前端而回退 runtime 边界设计
- 为了演示效果而引入第二套状态真相

---

## 当前工作包

当前迭代只维护少量活跃 work packages：

- active work package worker context
- current package artifact flow
- approval resume artifact execution
- rejection resume graph flow
- runtime view simplification for TUI consumption
- daemon reuse / recovery verification

每个工作包都应满足：

- 只解决一个主问题
- 明确写出 touched files
- 明确测试计划
- 明确 exit criteria
- 完成后能减少系统中"第二套真相"的存在

---

## 决策规则

遇到实现分歧时，按下面规则判断：

### 优先 runtime truth 而非 UI 便利

只要某个方案会让 TUI 拥有业务真相，就不选它。  
即使短期更快，也应回到 runtime protocol 侧解决。

### 优先一条明确路径而非两条部分路径

若 graph path 与 shortcut path 并存，优先删掉 shortcut。  
系统应只有一条权威执行路径。

### 优先 stable views 而非临时推导

凡是可以在 runtime 内形成 stable view 的，不放到外层临时拼装。

### 优先更少的活跃文档

同一主题只能有一个 active baseline。  
旧方案保留为 historical，不与当前主线竞争。

---

## 文档政策

仓库长期文档现在采用根级模型。  
实现与规划默认只看：

- `CONTROL.md`
- `AGENTS.md`
- `ROADMAP.md`
- `README.md`
- `NOISE_CANDIDATES.md`

不再维护 `docs/active` / `docs/work-packages` / `docs/historical` 作为长期文档层级。

---

## 仓库恢复执行计划

当前后续恢复工作统一按下面顺序推进，不再零散处理：

### 阶段 1：理解面恢复

目标：先把"怎么看懂系统"固定下来。

- 主路径阅读顺序写入 `CONTROL.md`
- 核心概念 `thread / run / task / approval` 映射写入 `CONTROL.md`
- 高频技术术语中英对照写入 `CONTROL.md`
- 对话中产生的稳定解释同步沉淀到根级文档

完成标准：

- 新加入的人只看根级文档就知道先读哪些文件
- 阅读代码时不会反复被英文术语卡住

### 阶段 2：状态流与界面映射恢复

目标：把"系统怎么跑"和"界面显示什么"写清楚。

- `submit_input -> run -> task -> approval -> resume` 主状态流转写入 `CONTROL.md`
- TUI 面板与 `ThreadView / RunView / TaskView / ApprovalView` 的关系写入 `CONTROL.md`
- 区分 domain 实体、sqlite store、protocol view 三层存在形态

完成标准：

- 可以明确回答每个���态��存在哪里、怎么变化、怎样显示到界面上

### 阶段 3：代码复杂度收口

目标：找出最该优先收的"大文件"和混职责文件。

- 在 `NOISE_CANDIDATES.md` 记录代码复杂度候选
- 标出每个候选为什么难懂、混了哪些职责、当前为什么先不拆
- 给出后续拆分方向，但本阶段不盲目重构

完成标准：

- 有一个稳定的"优先收哪里"的清单，而不是凭感觉下刀

### 阶段 4：结构减法执行

目标：在不破坏主路径的前提下做代码层减法。

- 优先处理最胖的 orchestrator / wrapper / UI 协调层
- 先拆职责，再考虑删除重复外壳
- 每次减法都必须说明：
  - 删除或收口了什么
  - 保留的权威边界是什么
  - 验证命令是什么

完成标准：

- 主路径文件数量更少
- 单个文件职责更清晰
- 新人不需要通读上千行文件才能修改局部逻辑

### 当前优先级

按顺序执行：

1. 补齐根级文档中的稳定解释
2. 完成代码复杂度候选清单
3. 再决定第一批真实代码拆分动作

---

## 当前非目标

以下内容当前不作为主线目标：

- 为了展示效果优先做 UI polish
- 为了多端接入提前抽象 frontend API
- 在 runtime truth 未稳定前推进复杂插件体系
- 在执行闭环未完成前扩大功能面
- 同时维护多份互相竞争的 roadmap / reset / redesign 文档

---

## 成功的样子

当下面这些事情成立时，说明 OpenPX 进入了下一阶段：

- planner → executor / verifier → approval / reject → resume → artifact → commit 是一条统一的执行链
- runtime snapshot / event / protocol 构成唯一真相源
- TUI 只消费 stable views，不再承载业务拼装逻辑
- interrupt / replay / recovery 具备可靠性
- 在此基础上，CLI 与后续前端产品化可以安全推进

---

## 简述

OpenPX 的近期目标不是"做更多"，而是"收得更准"。

先把：

- 执行闭环打通
- runtime truth 收紧
- TUI 变薄
- 恢复能力做稳

然后再做：

- 发布
- onboarding
- 多前端产品化
