## Context

Agent Fabric 已有 Google 登录、A2A Gateway、Edge Tunnel、Runtime Adapter、Codex ACP Adapter、MCP 和 Electron UI 等独立证据，但产品路径被 Messenger、Atlas、复杂 Grant、自部署和任务委派分散。本 change 不以旧功能兼容为目标，而是围绕一个真实闭环重新组合边界：Owner 在 macOS App 发布一个本地 Personal Agent；两个 Personal Agent 通过 Owner 交换一次性邀请码成为好友；Codex 通过 MCP 向好友发送文本；接收端 Edge 驱动本地 Runtime 自动回复；App 只观察状态。

关键约束包括：外部 Agent 数据面固定为 A2A v1.0.1 HTTP+JSON/REST；Runtime 凭据、绝对路径、私有配置和 Session ID 不得离开 Edge；Cloud 不运行 Agent；App 不能演变为聊天客户端；普通消息不获得副作用能力。

## Goals / Non-Goals

**Goals:**

- 让用户通过 Google 登录，在一个最短向导中完成本地 Runtime 选择、Agent Card 配置、MCP 启用和 Personal Agent 发布。
- 让单个新用户在发布完成后，无需第二个账号即可通过“我的 Agent · 自测”验证 MCP、Cloud 路由、本机 Runtime 与回复状态闭环。
- 让 Owner 通过一次性邀请码安全建立双向 Agent 好友关系，并看到由 Edge 与 Runtime 健康共同决定的真实在线状态。
- 让 Codex 只通过三个 MCP 工具完成好友读取、文本发送和结果读取。
- 让接收端后台 Host 在 App 没有聊天界面的前提下接收 Message、驱动本地 Runtime、自动返回文本 Artifact，并投影处理状态。
- 对每个好友隔离 Runtime Session，对高级操作 fail closed，并把人工关注原因准确展示给 Owner。
- 让 Cloud 只保存治理与消息状态元数据，正文与 Runtime 私有状态留在两端本机。

**Non-Goals:**

- 不做 App 内聊天、人工回复、群聊、移动端、多 Agent 账号、公开目录、市场、搜索推荐或 Human 社交网络。
- 不做 Matrix、消息级 E2EE、Cloud 离线消息队列、文件、多模态、Artifact 浏览、任务委派、取消或无限 Agent 自主对话。
- 不做 ContextCapsule、Atlas 或现有 Codex thread 接管；Personal Agent 使用 Edge 管理的专属 Runtime Session。
- 不在 App 内审批写文件、命令、网络、工具或其他副作用，也不在审批后恢复原任务。
- 不在本 change 交付通用自部署、双数据库、备份恢复、企业 SSO、计费或 Cloud Runtime。

## Decisions

### 1. Desktop App 是控制台，后台 Agent Host 是唯一执行入口

macOS App 只提供 Google 登录、我的 Agent、Agent 好友和消息动态四个交互面。Electron Main 管理本地身份引导和与 Agent Host 的受限 IPC；Renderer 只提交 Human 意图并读取最小投影。App 不提供消息输入框或人工回复命令。

P0 的 Agent Host 运行在由 Electron Main 监督的独立 `utilityProcess`，统一持有 Device/Agent 凭据、AgentSpec、Runtime Adapter、本地消息存储、好友级 Session 映射和 Cloud 出站连接。关闭窗口只隐藏到菜单栏并保持 Main 与 Host 运行，因此不影响 Agent 在线；用户执行“停止 Agent”、退出登录或完全退出 App 时停止 Host 并下线。独立 `launchd` 服务不进入 P0；若未来要求 App 完全退出后仍在线，再在保持 Host 契约不变的前提下拆出。

MCP 通过认证的 loopback/本地 IPC 调用 Host，而不是独立持有 Owner 管理凭据或复制 Cloud Client。这样 App、MCP 与远端消息共享同一 Agent 身份、状态和本地存储。

备选方案是让 App、MCP 分别直连 Cloud。该方案会复制凭据、重试、消息状态与 Presence 逻辑，因此拒绝。

### 2. Google Human 身份、Device 身份和 Agent 身份严格分离

App 使用系统浏览器发起 Google OAuth Authorization Code + PKCE。Cloud 完成 Google 身份验证后签发 App Session，并通过一次性设备登记为当前 Mac 签发可轮换 Device Credential。Google Token 不得成为 Agent、Edge 或 MCP 凭据；Device Credential 使用 Electron `safeStorage` 的异步 API 加密后保存在受限的 App `userData` 目录，密钥由 macOS Keychain 保护。凭据不得进入 SQLite、Renderer 或 MCP 环境。

Human Account 拥有一个 Personal Agent；Agent 使用独立稳定 Agent ID 和 Edge-held 凭据。MCP 只获得读取好友、发送消息和读取自身消息结果的受限本地能力，不能访问 App Session 或好友管理端口。

### 3. AgentSpec 是本机私有真源，Agent Card 是最小公开投影

P0 每个 Human Account 只允许一个 Personal Agent。用户选择由 Runtime Adapter 检测且通过健康检查的本地 AI 服务，并填写名称、描述和能力标签。AgentSpec 还包含选定 Adapter、固定文本回复策略和 Deployment 状态，但不上传 Cloud。

发布前 Edge 必须预检 Runtime。通过后创建不可变 Agent Revision，并投影出 A2A Agent Card：稳定 Agent ID、名称、描述、版本、HTTP+JSON 接口、Bearer 鉴权、`text/plain` 输入输出和公开能力摘要。路径、Runtime Session、凭据、私有 Skill/MCP 配置和完整策略不得进入 Agent Card、日志或 Cloud 数据库。

修改公开配置产生新 Revision；同一 Agent ID 保持稳定。P0 不提供旧 Revision 回滚 UI，但不得覆盖历史记录。

### 4. 一次性邀请码同时表达发现与目标 Owner 同意

系统不提供公共 Agent 搜索。Owner 在 App 为自己的 Agent 生成短期、单次消费的邀请码；另一个已登录 Owner 在自己的 App 消费邀请码后，Cloud 原子创建精确 Agent pair 的双向 Friendship。生成邀请码与消费邀请码分别是双方 Human 的明确动作，因此不再增加独立待接受页面。

同一 Agent pair 的重复消费保持幂等。任一 Owner 删除好友时，Friendship 进入 revoked，未来消息立即被 Cloud 和目标 Edge 双重拒绝；历史本地消息不承诺远程删除。

### 5. Presence 由 Host 连接和 Runtime 健康共同决定

Agent Host 使用 Device/Agent Credential 建立出站 WSS 长连接并定期上报 Agent ID、活动 Revision 和 Runtime 健康摘要。只有连接新鲜、Revision 匹配且 Runtime 健康时，好友端才投影 `online`；其他情况统一为 `offline`，不显示推测性的“最后在线”。

App 自身是否打开不参与 Presence。Cloud 不因旧心跳、App 缓存或部署记录而继续宣称在线。

### 6. Codex MCP 只保留三个工具

MCP 工具固定为：

- `list_agent_friends`
- `send_message`
- `get_message`

`list_agent_friends` 返回已激活好友的 Agent ID、公开摘要和 Presence。`send_message` 接收目标 Agent ID 与文本，默认等待终态；若在本地工具时限内未结束，则返回 Message ID 与当前状态。`get_message` 只允许读取当前 Agent 自己发起的消息。

不保留 `delegate_task`、`cancel_task`、`continue_context`、发布或管理工具。MCP 的 tool description 负责让 Codex 在用户表达联系好友 Agent 的意图时自主调用；App 不提供平行发送入口。

### 7. 普通消息使用 A2A，App 状态只是产品投影

Host 将 `send_message` 构造成标准 A2A Message，由 Gateway 校验调用身份和 Friendship 后路由到目标在线 Deployment。目标 Edge 确认接收后创建/更新标准 A2A Task；Runtime 最终文本作为 `text/plain` Artifact 返回。任何 Agent Fabric 路由信息都位于 HTTP/Control Plane 边界，不添加到规范 A2A 对象顶层。

App 状态映射如下：

| Product status | Source of truth |
| --- | --- |
| `sent` | Gateway 已认证并接受 |
| `received` | 目标 Edge 已校验并确认 |
| `processing` | `TASK_STATE_WORKING` |
| `replied` | `TASK_STATE_COMPLETED` 且存在文本 Artifact |
| `needs_attention` | `TASK_STATE_INPUT_REQUIRED` |
| `failed` | `TASK_STATE_FAILED` 或路由/Runtime 终止错误 |
| `offline` | 发送前目标没有健康 Deployment |

Cloud 保存 Message/Task ID、不可逆 Context 索引、参与 Agent、状态、时间和错误类别，不保存 Message Part 或 Artifact Part 正文。

### 8. 接收端按好友隔离 Session，并只允许文本回复

Edge 私下维护 `(localAgentId, friendAgentId) -> RuntimeSession`。来自同一好友的消息串行进入同一 Session，以支持最小连续性；不同好友必须使用不同 Session，不能看到彼此输入或回复。Runtime Session ID、cwd 和本地绑定不进入 Cloud、A2A、Agent Card 或 UI。

接收端外部文本始终标记为不可信来源，不能修改 AgentSpec、Friendship、凭据或策略。P0 Policy 只允许生成文本回复；当 Runtime 请求工具、文件、网络、命令、权限或其他副作用时，Edge 不批准、不继续执行，返回 `TASK_STATE_INPUT_REQUIRED`，App 显示原因，并向发送方返回标准化的“需要 Owner 人工处理”文本。P0 不提供恢复。

### 9. 消息正文只在线转发并在两端本地保存

Cloud 通过 TLS/WSS 在内存中转发当前在线请求和回复；目标离线立即返回 `offline`，不创建正文队列。发送端与接收端 Host 使用 Electron 内置 Node 的 `node:sqlite` 在受限权限的本地 Store 保存消息正文、回复、状态和好友级 Session 关联，供 MCP 等待/读取和 App 只读动态使用。数据库只由 Host 访问，启用 WAL、迁移版本和 prepared statements；首次打包前必须验证签名安装包中的 SQLite 可用性。凭据始终与数据库分离。

Renderer 只通过 schema allowlist 获得消息投影。活动列表默认展示来源、状态、时间和原因；只读详情可以展示本机正文，但不得提供编辑、发送或回复命令。

### 10. 新纵切优先，旧实现只按契约选择性复用

优先复用 A2A 类型/Gateway、Google 登录基础、Edge Tunnel、Runtime Contract、Codex ACP Adapter、Client SDK 和 MCP 安装能力。重写 Desktop 信息架构、Friendship 领域、消息状态投影和 MCP 工具面。Matrix、旧 Messenger UI、ContextCapsule、复杂 Grant、委派/取消和双数据库交付不进入新依赖图。

实现顺序先完成“两台 Fake Edge 经 Cloud 往返”的无 UI 纵切，再实现完整 App，避免界面先行掩盖真实链路缺口。

### 11. Desktop 采用 Multica-inspired clean-room UI，而不是复制 Multica

Multica 是用户指定的产品、视觉与交互基准。映射为：居中单任务登录卡片对应 Google 登录；macOS 原生感 App Shell、固定侧栏和内嵌页面画布构成已登录骨架；Runtime 详情与结构化设置行对应“我的 Agent”；Agent 集合页与 Presence 对应“Agent 好友”；Inbox 列表—详情对应只读“消息动态”。Board、Issue、Project、Workspace、Squad、Chat、Autopilot、Skills、Integrations、Billing 和高级 Agent 参数不进入产品。

Renderer 使用 Electron 43、React 19、TypeScript、`electron-vite`、Tailwind CSS 4、从上游官方来源独立生成的 shadcn/ui primitives、Base UI、Lucide、Sonner、Zod 和最小 Hash Router；`electron-builder` 负责 macOS 打包、签名与公证。Main、Preload、Host 与 MCP 保持 Node/Electron 进程边界，不因 UI 技术栈改变安全架构。P0 不引入 Zustand、TanStack Query、Motion、dnd-kit、富文本、图表或聊天组件；Host 是状态真源，Renderer 通过 typed IPC snapshot/subscription 和局部 React state 渲染。

不得复制、修改或导入 Multica 的 `apps/web`、`apps/desktop`、`apps/mobile`、`packages/views`、`packages/ui`、品牌资产、CSS Token、文案或 `@multica/*` 包。产品目录必须通过现有 source-policy 的 Multica marker 检查。可采用的通用开源依赖必须从各自官方来源独立引入、登记固定版本、许可证和 NOTICE，并建立 Agent Fabric 自有品牌、语义 Token、组件 API、空状态和交互文案。

备选方案包括从零使用原生 CSS、直接复制 Multica UI，以及购买 Multica 商业许可并保留或豁免品牌。原生 CSS 会重复建设大量基础交互；直接复制违反当前 source policy 并带来商业与品牌限制；商业授权对当前最小产品不是必要成本。因此选择独立上游组件栈加 clean-room 产品设计。

### 12. Desktop 页面改造由产品事实、行为契约和视觉系统三层共同约束

`apps/desktop/PRODUCT.md` 是 Desktop 的产品事实真源，记录用户、任务、产品边界、术语、证据与无障碍约束；本 OpenSpec change 继续作为可验收行为真源；Impeccable 负责视觉方向选择、结构稿、comp-first 设计稿、实现审查和最终设计系统沉淀。三者职责不得混写：视觉偏好不能改变产品权限，OpenSpec 状态也不能冒充视觉验收完成。

本轮属于用用户指定的 Multica 视觉与交互基准替换 Hallmark 风格，而不是继续进行无来源的概念世界竞赛。现有 `design.md`、Token、CSS 与截图只作为已实现状态和回归覆盖证据，不约束新方向。Impeccable 必须先把固定版本源码和用户截图抽象为 clean-room composition，锁定首屏结构、阅读顺序、主操作与跨页面系统，再修改 Renderer；完成实现与截图审查后，从实际交付结果重写 Agent Fabric 自有 `DESIGN.md`，并移除产品代码与验收文档中的 Hallmark 标记。

页面结构仍固定为登录与三个已登录目的地。改造必须让用户在无需理解 A2A、Revision 或 Runtime Adapter 内部实现的情况下，分辨以下内容：自己的 Agent 是否可用、哪些公开信息会发布、好友关系是否有效、消息处于哪个真实阶段、何时只能在产品外人工处理。公开 Agent Card、Edge 私有状态与 Cloud 连接状态必须形成清晰的信息边界。

每个页面必须覆盖加载、空、成功、离线、失败及适用的 `needs_attention` 状态；操作进行中不得改变布局或制造乐观完成。键盘顺序、`focus-visible`、文本与图标冗余、对比度、`prefers-reduced-motion` 以及 320/375/414/768 px 无文档级横向滚动属于验收契约。不得通过新增聊天框、设置页、分析页或审批入口解决信息架构问题。

备选方案是继续微调现有 Hallmark 视觉系统。该方案会让被移除的工具继续拥有隐性设计权威，因此拒绝。另一个方案是脱离用户指定参考继续发明概念世界；该方案已被用户明确拒绝。仍采用 comp-first，但所有 composition 必须处于同一 Multica-inspired clean-room 视觉世界，只比较适合 Agent Fabric 的页面组织，不再比较无关美术概念。

### 13. 自测联系人是虚拟投影，不是对自己的 Friendship

“Agent 好友”页面和 `list_agent_friends` 固定把当前 Personal Agent 投影为首项“我的 Agent · 自测”。该投影使用显式 `contactType: self`，不包含 `friendshipId`，不通过邀请码创建，不持久化 Friendship，也不能删除。真实好友使用 `contactType: friend` 并继续携带真实 `friendshipId`；UI 与 MCP 不得把两者混淆。

Cloud 只为一个严格条件开放自测路由：已认证 source Agent、target Agent 与当前 Deployment Agent 三者必须是同一个稳定 Agent ID，Revision 和 Presence 必须健康。该豁免不允许访问任何其他 Agent，不放宽邀请码、自添加、Friendship、撤权或消息读取规则。目标 Edge 使用保留的 `(localAgentId, localAgentId)` Session 键处理自测消息，最终回复只回到原始消息结果，不再次触发发送，从而避免递归。

自测闭环覆盖 Codex MCP、认证本地 Host、Cloud Gateway、当前 Edge、Runtime Session、文本 Artifact、本地状态和回复持久化。它明确不覆盖双方 Owner 同意、真实 Friendship、撤权、跨设备、跨好友隔离或远端离线，因此双账号验收仍是 Alpha 独立 Gate。

### 14. App 安装无副作用，首次发布自动连接 Codex MCP

`.app`/DMG 安装阶段没有 Human、Personal Agent、Host 端口和本地 MCP 能力，且不得擅自修改其他应用配置，因此安装 Agent Fabric 本身不写 Codex 配置。首次成功发布并建立健康 Host 后，Electron Main 自动调用现有 MCP 安装能力，保留用户 `~/.codex/config.toml` 的其他内容，原子写入 Agent Fabric MCP 条目并回读验证。

发布与 MCP 配置是两个连续但独立可观察的结果：若 Agent 发布成功而 MCP 配置失败，Agent 保持已发布和在线，App 必须显示具体的本地连接失败并提供“重新连接 Codex”动作，不得回滚 Cloud Revision 或谎称 MCP 已启用。成功后 App 显示“MCP 已启用 · 请重启 Codex”，首次主按钮使用“发布并连接 Codex”；已启用后的再次发布不得重复制造配置或新增常规设置步骤。

## Risks / Trade-offs

- [MCP 无法向正在使用的 Codex 对话主动推送迟到回复] → `send_message` 在工具调用时限内等待；超时返回 Message ID，Codex 通过 `get_message` 重取，同时 App 展示状态。
- [App 不做审批导致高级请求无法继续] → P0 如实结束为 `needs_attention`，不假装成功；恢复流程另立 change。
- [每好友一个 Session 可能随好友数增长] → P0 设置本地 TTL 和串行执行上限，Session 失效后新建但不跨好友复用。
- [Cloud 在线内存转发看得到瞬时明文] → TLS、禁止正文日志/持久化和严格泄漏测试；产品不得宣称 E2EE。
- [邀请码泄漏可能让非预期用户添加好友] → 短 TTL、单次消费、绑定目标 Agent、消费后失效并允许立即删除好友。
- [旧代码继续存在导致误接入] → 新 change 的包边界与默认入口测试禁止依赖 Matrix、旧 Messenger Store、ContextCapsule 和多余 MCP 工具。
- [本地 Host 与 Runtime 状态不一致] → Presence 同时要求连接新鲜、Revision 匹配和实时 Runtime 健康，任何不确定情况投影离线。
- [Multica-inspired 实现过度接近上游或误带源码/品牌] → 固定研究提交与参考截图，只抽取模式和设计原则；不粘贴源码、类名、Token 数值或像素几何，组件从独立上游生成，自建 Token/文案/品牌，并让 source-policy、依赖账本和视觉审查共同拦截直接衍生内容。
- [新视觉方向削弱真实状态或隐私边界] → 每个 comp 与实现评审都对照 `PRODUCT.md`、状态来源和敏感字段禁区；任何视觉表达不得先于 Host 投影宣称成功或在线。
- [comp-first 增加前期设计成本] → 仅为登录、App Shell 与三个固定目的地建立一个可复用系统，方向确认后批量实施，不为同一页面重复发明风格。
- [`utilityProcess` 随 Main 完全退出而停止] → 明确“关窗保持在线、完全退出即离线”的 P0 语义，菜单栏提供停止与退出；需要脱离 App 生命周期时另立 `launchd` change。
- [桌面构建链迁移影响签名包或本地 Host] → 先完成最小 Electron shell、utility process、SQLite 和 `safeStorage` 的签名包冒烟，再迁移完整页面。
- [自测联系人被误解为真实好友验收] → 使用固定“我的 Agent · 自测”命名和独立 `contactType`，UI 说明其覆盖范围，并保留双账号 Alpha Gate。
- [发布成功但 MCP 本地配置失败] → 不回滚已发布 Revision；分别投影 Agent 与 MCP 结果，只在失败态显示重试并要求成功后重启 Codex。

## Migration Plan

1. 新 change 成为唯一活动产品实现清单；旧 Messenger 与 Headless change 标记 superseded/paused，但暂不删除代码或证据。
2. 先冻结新契约、状态机、Agent Card 投影和包依赖规则，以 Fake Runtime 完成双 Host 消息纵切。
3. 接入 Google 登录、单 Agent 发布和 Presence，再实现邀请码 Friendship。
4. 收敛 MCP 工具并接入真实 Codex Runtime，完成两台真实 Mac 的文本往返。
5. 以 `apps/desktop/PRODUCT.md` 为产品真源，基于固定的 Multica 研究提交与用户截图，通过 Impeccable 生成同一视觉世界中的 comp-first 页面组织方案，再以 clean-room 方式重建 Agent Fabric 自有设计 Token、基础组件和 Desktop 四个交互面，完成源码隔离、视觉状态及高级操作 fail-closed 验收。
6. 新纵切通过全部泄漏、撤权、离线和两机验收后，再删除默认入口对旧模块的引用；回滚时切回旧分支/发行物，不迁移或破坏旧本地数据。

## Open Questions

无。首个 Alpha 只开放 Codex Runtime；Runtime 选择器只展示真正已实现并健康的 Codex Adapter。Cloud P0 沿用当前 MySQL 路径，PostgreSQL 不进入新默认产品依赖图。
