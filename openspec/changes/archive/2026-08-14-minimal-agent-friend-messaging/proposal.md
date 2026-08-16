## Why

Agent Fabric 现有 Messenger 与 Headless 方案同时承载房间、任务委派、上下文快照、自部署和运维等多条产品路径，已经偏离最核心的用户目标。当前需要以最小产品重新起步：用户发布一个由本地 AI 服务驱动的个人 Agent，把其他 Agent 加为好友，并让 Codex 通过 MCP 发起纯文本消息、获得远端 Agent 的自动回复。

## What Changes

- **BREAKING**：新的默认产品不再提供 App 内聊天、Matrix 房间、四方参与者、Atlas/ContextCapsule 发布、任务委派、公开 Agent 目录或离线消息；`trusted-agent-messenger-mvp` 与 `headless-agent-fabric-cli-mcp` 保留为历史证据，但不再是新产品实现清单。
- 提供 macOS 首发桌面 App，通过 Google 登录，并把 Human Account、Device 与 Personal Agent 保持为独立身份。
- 每个账号首版只发布一个个人 Agent；用户选择已检测且健康的本地 AI Runtime，填写最小 Agent Card 后发布并看到真实在线状态。
- 首次成功发布时由 App 自动为 Codex 配置并回读验证本地 MCP；安装 App 本身不修改 Codex 配置，自动配置失败时保留已发布 Agent 并提供明确重试。
- Agent Owner 通过一次性邀请码建立精确的双向 Agent 好友关系；只有有效好友可以互发消息，任一方删除好友即阻断未来消息。
- “Agent 好友”与 MCP 好友列表固定展示一个“我的 Agent · 自测”虚拟联系人，用于单机跑通 Codex MCP → Cloud → 本机 Edge → Runtime → 回复的真实链路；该联系人不是 Friendship，不通过邀请码创建且不能删除。
- App 只提供 Agent 配置、好友管理、在线状态和只读消息动态，不提供消息输入、人工回复或聊天会话界面。
- Desktop 产品事实由 `apps/desktop/PRODUCT.md` 固化；后续页面改造使用 Impeccable 重新建立视觉方向与交互层级，当前 Hallmark 产物只作为现状证据，不再作为设计权威。
- Desktop 采用用户指定的 Multica-inspired clean-room 视觉与交互骨架：借鉴其登录、macOS App Shell、Runtime、Agent、Presence、Inbox、列表—详情和结构化设置行的组织范式，但独立实现品牌、布局尺寸、设计 Token、组件和业务代码，不复制或依赖 Multica 源码、资产及 `@multica/*` 包。
- Codex 通过最小 MCP 工具读取 Agent 好友、发送纯文本消息并读取消息结果；MCP 无权登录、发布 Agent、管理好友或扩大权限。
- 接收端 Edge Host 驱动专属的本地 Runtime Session 自动生成文本回复，并向 App 投影已收到、处理中、已回复、失败和需要人工关注等状态。
- 首版普通消息只允许文本回复。写文件、执行命令、网络访问、权限申请及其他高级操作不在 App 中审批，统一停止为“需要人工关注”。
- Cloud 仅保存身份、Agent Card、好友、Presence 与消息状态元数据；正文只在线内存转发并保存在两端本地。目标 Agent 离线时立即失败，不做 Cloud 离线队列。
- 外部 Agent 数据面继续使用固定的 A2A v1.0.1 HTTP+JSON/REST；MCP、App 与 Edge 不创建第二套消息协议。
- 明确非目标：移动端、多 Agent 账号、Human 社交关系、群聊、市场、搜索推荐、文件与多模态、计费、自动授权、无限 Agent 对话、Cloud Runtime、E2EE 宣称、双数据库与通用自部署交付。

## Capabilities

### New Capabilities

- `google-account-login`: 桌面 App 的 Google 登录、设备登记、凭据隔离和安全退出。
- `personal-agent-publication`: 本地 Runtime 检测与选择、最小私有 AgentSpec、Agent Card 配置、发布、停止和真实在线状态。
- `agent-friendship-presence`: 一次性邀请码、双向 Agent 好友、删除撤权以及好友在线状态。
- `mcp-agent-messaging`: Codex MCP 发起纯文本消息、远端 Edge 自动处理与回复、A2A 状态映射及好友级 Runtime Session 隔离。
- `message-activity-monitoring`: App 的只读消息动态、处理状态、失败原因和人工关注提示。

### Modified Capabilities

无。现有主规格只有独立自测能力；本 change 以新的产品能力集合建立实现真源，不修改旧 change 的未归档规格。

## Impact

- Product UI：重做 `apps/desktop`，只保留登录、我的 Agent、Agent 好友和消息动态；以 `apps/desktop/PRODUCT.md` 与本 change 约束产品事实，通过 Impeccable 将用户指定的 Multica 视觉与交互基准 clean-room 映射为 Agent Fabric 自有 App Shell、页面结构、状态覆盖和最终审查。不复用旧 Messenger 聊天信息架构，也不引入 Multica 产品代码、品牌资产、Token 或像素几何。
- Self-test：增加不落 Friendship 的本机 Agent 虚拟投影与精确同 Agent 路由豁免；它只验证单账号消息闭环，不替代双账号邀请、撤权和跨好友隔离验收。
- Client toolchain：保留 Electron 43、React 19、TypeScript 和 Zod，采用 `electron-vite`、`electron-builder`、Tailwind CSS 4、从官方来源生成的 shadcn/ui primitives、Base UI、Lucide、Sonner 与最小 Hash Router；所有新增第三方依赖先登记并通过 source policy。
- Edge Host：收敛为桌面 App 与 MCP 共用的本地后台 Host，负责 Runtime 健康、Presence、好友级 Session、消息正文和状态投影。
- Runtime Adapter：复用 Runtime-neutral 契约和 Codex Adapter；首版只允许文本回复，高级工具事件统一转为人工关注。
- MCP：将工具面收敛为好友列表、发消息和取消息，不暴露发布、好友或管理权限。
- Control Plane / Gateway：保留 Google 身份、Agent Registry/Card、好友、Presence、A2A 路由和最小消息状态；移除新产品对 Matrix、房间、ContextCapsule、复杂 Grant 与离线队列的依赖。
- Persistence：Cloud 首版只支持当前选定的单一关系型数据库；消息正文与 Runtime 私有数据仅保存在 Edge 本地存储。
- OpenSpec：新 change 成为后续实现与验收依据；旧 change 不删除、不继续扩展，也不得被当作已交付能力。
