## Context

Agent Fabric 已有的 Architecture v1 把标准 A2A、产品 Control Plane 和本机 Runtime Adapter 分开，但旧 Foundation change 明确不包含产品 UI 和端到端加密。可信 Agent Messenger MVP 要交付一个更窄、但可以被真实用户验证的产品：两个用户先建立可信联系人关系，再在加密房间中让各自的本机 Agent 协作。

首版面向 macOS，房间只有两个 Human Principal；每人最多挂载一个本机 Agent Principal。Human、Device 和 Agent 保持独立身份。Agent 不作为独立 Matrix 账号登录，而是由 Owner 的已验证设备发送带 Agent 签名证明的加密事件，从而同时保留 Matrix 的人类账号模型和 Agent 的独立授权、审计语义。

该变化跨越 Electron UI、Matrix E2EE、Control Plane、A2A Task 映射、Edge Host 和本机 Runtime。密码学、同步、通用聊天组件、A2A 类型和 Codex 驱动必须优先采用成熟开源实现，项目只维护可替换适配层和差异化策略。

## Goals / Non-Goals

**Goals:**

- 让两个用户通过人工邀请和接受建立 1 对 1 可信联系人关系。
- 创建默认且强制 E2EE 的房间，并支持离线密文、设备验证和未来消息撤权。
- 在一个房间中清晰呈现两个人和各自 Agent 的身份、来源和在线状态。
- 将 `@Agent` 请求映射为标准 A2A Message/Task/Context/Artifact 语义，支持状态、结果、取消和连续追问。
- 让默认 Electron 产品入口真实路由本机与远端 Agent，并只依据目标 Edge/Runtime 的真实事件推进 Task；任何演示夹具必须显式标注且不得进入默认产品路径。
- 让 Owner 在当前 Codex 对话中只需说“发布为 Atlas”并确认一次，即可把当前有效上下文的压缩快照发布为本机 Agent；首个真实任务继承该快照，并使用当前本机重新发现的能力。
- 通过 Runtime-neutral ACP 边界驱动本机 Codex，保证凭证、cwd、私有上下文和 Runtime Session 留在 Edge。
- 以依赖清单、版本固定、许可证检查和适配器契约落实 source-first 策略。
- 使用自动化场景验证撤权、离线、取消、隔离、默认拒绝和敏感信息泄漏。

**Non-Goals:**

- 不做群聊、移动端、公开目录、市场、交易、计费或企业 SSO。
- 不做写文件、部署、付款或任何默认允许的副作用能力。
- 不自行实现密码学、Matrix Homeserver、通用聊天 UI、A2A 类型或 Codex App Server 驱动。
- 不把 Matrix 房间事件宣称为标准 A2A binding；第三方 A2A 仍使用官方 HTTP+JSON/REST 接口。
- 不让云端运行 Owner Agent、持有模型凭证或保存房间明文。
- 不迁移或兼容冻结 Demo 的 `/api/tasks`、Store 或私有 conversation API。
- 不复制、fork 或跨进程接管原 Codex thread；首版发布的是有明确来源标记的压缩快照，并且一个快照只能发布到一个 Agent 和房间。

## Decisions

### 1. Matrix 是加密消息传输，A2A 是任务语义

普通人类消息使用标准 Matrix 加密房间事件。Agent 工作使用版本化的 Agent Fabric 加密事件 envelope，payload 保持为 A2A v1.0.1 Message、Task、Context、TaskState 或 Artifact 的标准 JSON 形状；envelope 只增加传输版本、幂等键和 Agent 签名，不向 A2A 对象添加私有字段。

房间内传输不对外声明为新的 A2A binding。需要与第三方 Agent 互操作时，Gateway 仍暴露 A2A HTTP+JSON/REST，并在边界处转换为相同的内部 A2A domain 对象。

选择原因：Matrix 已解决 E2EE、设备密钥、房间成员、离线同步和重试；A2A 已解决 Agent 工作状态与产物。强行让其中一个承担另一方职责，都会导致自研协议或自研密码学。

备选方案：所有房间消息都走 A2A Gateway。该方案会让云端看到正文或要求自研消息级 E2EE，因此拒绝。

### 2. 使用 Matrix JS SDK 的 Rust Crypto，并隔离到 main 管理的 Crypto Worker

`matrix-js-sdk` 在非浏览器环境只能使用临时内存 Crypto Store，持久 Rust Crypto 需要浏览器 IndexedDB。因此 Electron main 负责创建、认证、监督和销毁一个无界面、不可导航、无 Node 集成的隔离 Crypto Worker/WebContents；该 Worker 独占 Matrix Client、Rust Crypto/IndexedDB store、设备密钥和房间同步。普通 Renderer 不得直接访问 Worker、Matrix Client、密钥或明文存储，只能通过 main 的类型化 allowlist IPC 接收最小 UI 投影和提交用户意图。

每个 Matrix Device/Crypto Store 同时只能存在一个 Worker 实例。Worker 启动失败、崩溃、导航、来源认证失败、持久 IndexedDB 不可用、E2EE 初始化失败或房间创建失败时必须 fail closed，停止同步与发送并向普通 Renderer 投影可恢复安全错误，不允许切换到内存 Crypto Store 或明文。

开发 Spike 使用未修改的独立 Matrix Homeserver。Homeserver 保持可替换；正式商业 Alpha 前必须完成 Synapse AGPL/商业许可或替代实现的书面决策。

备选方案：在 Electron main 的纯 Node 环境使用临时内存 Crypto Store、复制 Element/Multica UI、切换到未经 M1 验证的原生 SDK，或实现自有加密信箱。内存 Store 无法跨重启保留设备身份，复制方案带来许可证与产品耦合，另换 SDK 会扩大验证范围，自研密码学风险不可接受，因此均拒绝。

### 3. Agent 是独立 Principal，但由 Owner Device 代发 Matrix 事件

每个本机 Agent 生成独立 Agent Principal 和 Edge-held signing key。Agent 回复由 Owner 的 Matrix 设备发送加密事件，同时签署 canonical envelope；接收端根据已授权 Agent Card 验证 Agent ID、Owner、Revision 和签名。UI 同时显示 Human sender 和 acting Agent，禁止把 Agent 内容伪装成人工消息。

Agent 不获得联系人、房间成员、设备或 Grant 管理 API 的凭证。Agent 的 Matrix 发送权限被限制为当前任务产生的消息和状态事件。

备选方案：为每个 Agent 建立 Matrix bot 账号。它增加账号生命周期、密钥备份和 bot 入房授权复杂度，首版拒绝。

### 4. 人类专属动作由可信 UI 手势触发

邀请/接受联系人、验证设备、挂载/移除 Agent、授予/撤销调用权和批准未来敏感能力只允许由 Renderer 的明确用户手势发起，并由主进程绑定当前 Human session 执行。ACP、MCP、A2A Task、房间文本和 Agent 工具调用不能访问这些命令。

首版 Agent Policy 固定为 filesystem read-only、network deny、side effects deny。超出能力的请求返回标准 `TASK_STATE_INPUT_REQUIRED` 或 `TASK_STATE_REJECTED`，但 MVP 不提供提权后恢复执行。

### 5. Runtime 采用 ACP，拒绝 Paperclip 执行器

Edge 定义最小 Runtime Adapter contract：detect、inspectCapabilities、create/resume、execute、cancel、close 和统一 RuntimeEvent。Codex Adapter 采用官方 ACP `codex-acp`，但 ACP session 和内部事件不得越过自有 Adapter 边界。

Paperclip `adapter-codex-local` 与 `adapter-utils` 的发布包可脱离服务端导入，但完整执行 API 依赖 Paperclip 的 company、heartbeat、billing、managed CODEX_HOME、workspace 和 runtime progress 语义；其当前发布版还默认 `dangerouslyBypassApprovalsAndSandbox=true`，并把 `codex_local` 标记为由 Runtime 原生管理上下文。这与本产品固定只读策略和显式 TTL/successor/budget 规则冲突，因此执行器被拒绝，只保留窄工具和契约思路作为参考。

生产代码不得直接复制 Multica 或 Paperclip Adapter，也不得在没有新设计评审的情况下编写第二套 Codex App Server driver。Fake Runtime 与真实 Adapter 必须运行同一套契约测试。

选择原因：ACP 已覆盖会话、权限请求、工具事件、取消和多 Runtime 接入，并且不会把另一个产品的控制面模型带进 Edge。

### 6. 房间任务使用幂等事件日志和 Edge 私有 Session 映射

每次 `@Agent` 产生新的 taskId；同一对话沿用 contextId；terminal Task 不复活。Matrix eventId 和 envelope idempotencyKey 用于去重。Edge 私下维护 `(roomId, contextId, agentId) -> RuntimeSession`，该映射不进入房间、Control Plane 或日志。

目标 Agent 离线时，密文请求由 Matrix 保存，UI 显示 submitted/offline，不能显示 working。Edge 重连后校验联系人、Grant、Agent Revision 和取消墓碑，再至多执行一次。

### 7. 撤权阻止未来访问，但不承诺抹除历史

撤销联系人或 Agent Grant 后，Control Plane 立即拒绝新调用，Edge 停止未开始的任务并请求取消进行中任务，Matrix 房间移除对应成员/Agent 并轮换未来会话密钥。已经合法下发到对方设备的历史明文和密钥无法远程收回，产品必须明确说明这一限制。

### 8. Cloud 只保存路由与治理元数据

Control Plane 可保存 Human/Device/Agent Principal、联系人状态、公开 Agent Card、Grant、Deployment、Presence、roomId、taskId、TaskState、时间和用量摘要。它不得保存房间正文、Artifact 正文、模型凭证、绝对路径、Runtime Session、私有 AgentSpec 或隐藏推理。

正文可观测性只在用户设备本地、显式开启的诊断范围内存在；默认日志做结构化 allowlist，而不是事后黑名单脱敏。

### 9. Source-first 依赖必须可审计、可替换

每个进入产品的第三方包或源码必须记录：仓库、固定 commit/version、许可证、NOTICE/署名义务、采用模块、本地修改和替换接口。CI 必须阻止未登记的源码拷贝和禁用许可证进入分发物。

Multica 仅作为产品/架构参考，除非取得商业许可和需要时的品牌豁免。Matrix、assistant-ui、ACP、A2A 等采用依赖都位于自有 adapter 后，避免上游变化穿透 domain；Paperclip 已降级为研究参考，不进入产品依赖。

### 10. 默认产品入口只呈现真实执行状态

Renderer 只提交用户意图，不自行计时推进 Task。Electron main 根据目标 Agent Owner 选择路由：`@` 本机 Agent 时，把已授权 Task 交给本机 Edge 与生产 Runtime Adapter；`@` 联系人的远端 Agent 时，把加密 Task 交给 Matrix，直到远端 Edge 发出已验证的开始事件前保持 `TASK_STATE_SUBMITTED` 并显示离线或等待远端。

`TASK_STATE_WORKING`、`TASK_STATE_COMPLETED` 和 Artifact 必须分别来自目标 Edge 的真实开始、Runtime 进度/终态和 Runtime 结果事件。确定性 Demo/Fake Runtime 只能用于测试夹具或显式“演示模式”，不得作为默认应用 Store，也不得用固定延时、固定文案或合成 Artifact 冒充执行成功。Runtime 不可用、未认证、远端离线或传输未配置时，产品必须显示可恢复原因，而不是 completed。

选择原因：UI 投影测试只能证明交互和渲染，不能证明用户工作被执行。把状态推进权留在目标 Edge 可以同时避免假成功、远端误导和 Renderer 注入后伪造 Agent 结果。

### 11. 当前 Codex 对话通过上下文快照发布成为 Agent 来源

本机 Agent 的默认发布入口位于 Owner 正在使用的 Codex 对话中。Owner 说“发布为 Atlas”或显式调用发布 Skill 后，Skill 只读取模型在当前 turn 实际可见的有效上下文，将其整理为版本化、大小受限的 `ContextCapsule`。胶囊包含目标、已确认事实、决策、约束、未完成事项、必要的相对文件引用、创建时间和覆盖等级；不得包含隐藏推理、凭证、原始 Runtime/thread ID、绝对路径或未经选择的完整历史。

Skill 负责准备胶囊并调用本机 `agent-fabric atlas publish-context` CLI，但无权自行完成挂载。CLI 把发布请求交给正在运行的 Desktop/Edge，可信本机确认面向 Owner 展示联系人影响、上下文覆盖等级和公开能力摘要；Owner 再次确认后，Edge 才把胶囊绑定到确定的 Agent 与房间。该确认使用一次性 nonce、短 TTL 和消费后失效，ACP、MCP、A2A、房间文本或模型输出不能伪造确认。

Edge 为已确认胶囊创建新的私有 Runtime session，并把胶囊作为第一条受信来源说明注入；首个 Task 与后续 Task 均恢复这个新 session。Edge 私下维护 `(agentId, roomId) -> snapshot Runtime session` 绑定，快照正文、绝对 cwd 和 Runtime handle 不进入 Matrix、A2A、Control Plane、Agent Card、日志或遥测。UI 只显示“上下文快照”、覆盖等级、创建时间和公开能力摘要，不宣称精确继承原会话。

Skills/MCP 不是快照内容。Edge 使用发布请求中经过本机校验的私有工作目录，在创建 session、发布确认和每次恢复时重新检查当前 Codex host 的用户级、项目级 Skills 与 MCP 配置。保存的 Agent Revision 只包含公开 allowlist 与能力指纹；能力减少时阻止不兼容执行，新增能力不会自动扩大房间 Grant。首版固定只读策略仍覆盖所有 Skill/MCP 调用。

选择原因：跨进程接管一个仍被 Codex Desktop 持有的原 thread 并不可靠，而且让用户理解“已结束、可恢复、独占租约”产生额外心智负担。由当前对话自己生成有效上下文快照，再通过本机 CLI 和一次 Human 确认发布，不依赖原 thread 的恢复状态，用户只需表达一次意图并确认一次。

备选方案：继续要求用户在 Messenger 中选择已有会话并由另一 Runtime 恢复原 thread。它保真度更高，但受跨进程 session ownership 影响且交互复杂，因此退出默认产品路径。读取完整本地历史再发布会扩大隐私面，也不采用。

## Target Modules

```text
apps/desktop                    Electron main, isolated Crypto Worker/WebContents, renderer and typed IPC
packages/messenger-domain       principals, contacts, rooms and human authority
packages/matrix-transport       E2EE client, sync and encrypted envelopes
packages/a2a-task               pinned A2A types and room/task mapping
packages/runtime-contract       runtime-neutral adapter and contract suite
packages/ui                     assistant-ui based room and task surfaces
apps/control-plane              contacts, grants, registry, presence and metadata
apps/edge-host                  room intake, policy, sessions and runtime orchestration
adapters/runtime-fake           deterministic contract adapter
adapters/runtime-codex-acp      ACP client wrapper for codex-acp
docs/third-party-sources.md      provenance and license ledger
```

## Risks / Trade-offs

- [Matrix Homeserver 当前主流实现存在 AGPL/商业许可决策] → Spike 只运行未修改独立服务；商业 Alpha 前设硬性许可证 Gate，并保持 transport 可替换。
- [assistant-ui 偏单 Agent 聊天] → 先验证多参与者、任务卡片和持久化；不通过则只复用基础组件或替换 UI 层。
- [Paperclip Adapter 与自身 Control Plane 耦合] → M1 已验证并拒绝完整执行器；实现计划只保留 `codex-acp` 和自有 Adapter contract。
- [ACP 取消可能早于 Codex turn 建立] → Edge 必须保留取消意图并在 turn 建立后继续传播；M1 已用持续运行中的真实 Prompt 证明 `session/cancel` 返回 `cancelled`。
- [Matrix 事件并非官方 A2A binding] → 明确它只是加密内部 transport；外部互操作继续走官方 A2A HTTP 接口和 conformance tests。
- [Owner Device 代发 Agent 事件可能混淆身份] → Agent envelope 独立签名、UI 双重来源标识、审计同时记录 Human sender 与 Agent actor。
- [撤权无法抹除对方已有历史] → 产品如实说明，只保证阻断未来访问与轮换未来密钥。
- [普通 Electron Renderer 被注入后接触敏感状态] → Matrix Client、Rust Crypto、密钥与 IndexedDB 只在 main 管理的隔离 Crypto Worker；Worker 无导航、无 Node 集成且使用双向来源认证，普通 Renderer 保持 contextIsolation 并只通过 allowlist schema 接收最小投影。
- [Crypto Worker 崩溃或出现重复实例导致 Store 损坏] → main 强制每个 Matrix Device/Store 单实例、监督生命周期并在退出/异常导航时 fail closed；重启前完成旧实例关闭和 Store ownership 释放。
- [离线请求恢复后重复执行] → eventId + idempotencyKey + 本地 durable inbox + 取消墓碑保证至多一次开始。
- [上下文快照可能遗漏、压缩错误或包含不适合联系人获知的知识] → 胶囊采用结构化字段和覆盖等级，发布前显示明确的数据影响确认；UI 永远标记为“上下文快照”而非原会话，Owner 应只发布适合共享的当前对话。
- [Skill 或模型尝试绕过 Human 确认自行发布] → Skill 只能创建短期发布请求；真正挂载由 Desktop/CLI 的一次性 Human 确认完成，模型执行路径拿不到确认能力。
- [本机 Skills/MCP 在发布后变化] → 创建和每次恢复都重新检查公开能力指纹；能力减少时停止执行，能力增加时不自动扩大 Grant。

## Migration Plan

1. 保留 `agent-fabric-v1-foundation` 为未实现的架构研究，不归档、不复制其任务。
2. 在研究目录完成 Matrix、assistant-ui、ACP/Paperclip 三个 Spike，并记录采用/淘汰证据。
3. 只有通过 Gate 的依赖才能进入主工程；先建立 domain、Fake Runtime 和本地双用户测试夹具。
4. 完成单机双身份的加密房间纵切，再扩展到两台真实 Mac。
5. 完成撤权、离线、取消、隔离和泄漏测试后，才打包签名 Alpha。
6. 任一关键依赖失败时回滚到前一 Gate；不保留半接入实现或复制上游内部代码兜底。

## Open Questions

- 商业 Alpha 使用 Synapse 商业许可、托管 Matrix，还是经验证的宽松许可 Homeserver？M1 必须给出决定。
- 首轮内测采用邀请码账号还是已有组织身份登录？不影响 E2EE/Runtime 纵切，但必须在打包 Alpha 前决定。
