# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户是在自己的个人 Account 中创建、配置和管理多个本地 AI Agent 的 Human Owner。用户在 macOS Desktop 中完成登录、好友邀请、私有 Runtime 管理、Agent 创建与治理；好友与 Codex MCP 可以发现并调用 Owner 明确开放的 Agent，但不能管理对方 Account 或资源。

## Product Purpose

Agent Fabric Desktop 提供完整的个人多 Agent 管理与好友互联产品：以 Multica Agents 为功能、信息架构和交互质量基准，支持 Agent 目录、三种创建方式、AI Builder、详情配置、权限、状态、活动、私有 Runtime 和 Human 好友。

产品成功意味着两个用户可以分别登录自己的个人 Account，完成“发出好友邀请 → 对方在收件记录接受 → 建立好友但不改变 Account 所有权 → A 开放某个 Agent → B 在 App 与 MCP 看见安全摘要 → 标准 A2A 问答 → 私密化或删除好友后立即失去访问”的真实闭环。

## Positioning

Agent Fabric 聚焦 Agents 本身。Account 是个人资源与 Runtime 的隔离边界，Human Friendship 是跨 Account 的调用授权前提；Runtime 提供真实本地执行；Agent 当前配置直接持久化；MCP 是本地 Codex 等 Agent 使用统一权限调用 Fabric Agent 的薄入口。Cloud 不运行 Owner Agent，不托管模型凭据；Runtime session ID、cwd、凭据和私有运行上下文留在 Edge。

## Operating Context

- 运行于 Electron macOS Desktop；Renderer 使用 Web 技术，但不直接持有凭据、访问 Runtime 或连接 Cloud。
- 首个官网直装发行版为 Apple Silicon `0.1.0-beta.1`；使用 Bundle ID `ai.agentfabric.desktop`、Agent Fabric 正式图标、Developer ID 签名、Hardened Runtime、Apple 公证和 stapled DMG，不以未公证或仅构建成功的包对外发布。
- 登录使用 Google 系统浏览器；首次登录创建该 Human 唯一的个人 Account。好友邀请只进入匹配已验证身份的邀请收件箱，不加入邀请人的 Account。
- 已登录后主导航固定为“智能体”“运行时”“好友”，Account/退出和连接状态保持次级。
- 一个个人 Account 可以拥有多个 Agent；Agents 页面提供我的、好友开放、已归档范围。
- 新建 Agent 支持空白创建、模板创建和 AI Builder，草稿可恢复。
- Owner Agent 详情按概览、活动、能力和设置组织；好友 Agent 只有独立只读安全摘要。
- Codex MCP 只发现本人和好友当前开放且可调用的 Agent，并通过标准 A2A Message/Task/Artifact 完成问答。

## Capabilities and Constraints

- Agents 功能面完整对齐固定 Multica 研究提交中的 Agents 目录、创建、详情、配置、权限、Runtime、状态、活动和归档恢复。
- 产品不提供 Workspace、项目、任务板、Inbox、Autopilot、统计大盘或 App 通用聊天。
- 当前阶段不提供 AgentSpec、Revision、Deployment、发布、回滚或持久化 Agent Card 产品体系；A2A Agent Card 按当前 Agent 数据动态投影。
- 首期只展示并允许选择真实实现且健康的 Codex Runtime Adapter；领域模型保持 provider-neutral。
- Agent 管理权限与调用权限分离；只有 Owner 可管理，活跃好友只能调用当前 `friends` Agent；所有 UI、MCP 和 A2A 入口使用同一份授权结果。
- MCP 仅暴露 `list_agents`、`find_agent`、`ask_agent` 和 `get_task`，不得管理登录、好友、Runtime、Agent 或秘密。
- 好友 Agent 安全摘要只包含名称、描述、Owner 展示摘要、公开能力和可用性，不包含 Account 内部字段、Runtime/模型/配置、Instructions、Skills、Activity、负载、秘密或私有标识符。
- Presence、工作状态和最近活动必须来自真实 Edge/Runtime/A2A 事件，不使用 UI 推测或乐观完成。
- Cloud 不接收 Runtime Session ID、cwd、模型凭据、环境变量值、私有 Runtime 上下文或私有 Skill/MCP 内容。

## Brand Commitments

- 产品名称为 Agent Fabric，核心对象称为个人 Account、智能体、运行时、好友和本地 Agent Host。
- Multica 是用户指定的功能、信息架构、交互和视觉完成度基准；应尽可能保持相同的页面组织、信息密度、控件位置、反馈状态和操作步骤。
- 对齐必须 clean-room 落地：不得复制、翻译、修改、导入或依赖 Multica 源码、资产、品牌、文案、Token、组件 API、类名、私有接口或像素几何。
- Agent Fabric 独立定义品牌、语义 Token、组件、文案和尺寸；状态必须技术准确，不虚构在线、权限、成功或数据安全。

## Evidence on Hand

- 当前唯一产品目标：`../../openspec/CURRENT.md`
- 当前 OpenSpec change：`../../openspec/changes/replace-account-members-with-friends/`
- 长期架构边界：`../../ARCHITECTURE.md`
- 用户指定研究仓库：`/Users/hyy/project/multica`，固定提交 `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7`
- clean-room 研究记录：`../../docs/research/multica-ui-reference.md`
- 最终 UI 证据：`../../docs/implementation/multica-aligned-agents-product/shipped-ui-evidence.md`
- 历史 Google、A2A、Runtime、MCP 和泄漏测试可复用，但历史产品模型不具备当前权威。

## Product Principles

1. 完整交付 Agents 产品状态，不把页面外观或构建成功当作完成。
2. 对齐 Multica 的成熟交互，同时保持实现和品牌独立。
3. 好友不拥有彼此 Account；Agent Owner 独立决定是否向全部活跃好友开放，Codex MCP 只获得最小调用能力。
4. 不确定即显示未知、离线、失败或无权限，不以视觉反馈替代真实系统状态。
5. Runtime 私有状态留在 Edge；跨好友来源、跨 Account、跨 Agent 和跨会话必须隔离。

## Accessibility & Inclusion

- 所有操作必须支持键盘完成，并提供清晰 `focus-visible`、焦点返回和脏数据保护。
- 状态不得只依赖颜色，应同时使用文字或图标。
- 文本和交互控件需满足可读对比度，触控目标至少 44 px。
- 支持 `prefers-reduced-motion`；加载、空、无匹配、错误、离线、无权限、未绑定和已归档状态必须可被辅助技术识别。
- Renderer 在 414、768 和目标桌面窗口宽度下不得产生文档级横向滚动或隐藏关键操作。
