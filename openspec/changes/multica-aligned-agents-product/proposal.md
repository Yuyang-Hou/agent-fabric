> Change authority: `multica-aligned-agents-product`

## Why

Agent Fabric 当前围绕“一个账号、一个 Personal Agent、好友消息”的最小纵切构建，无法承载用户已经明确选择的产品方向：以 Multica 的 Agents 产品为基准，提供可持续使用的多 Agent 创建、管理、运行和成员协作能力。现在需要用一份新的唯一目标替代全部历史产品计划，避免继续在即将废弃的单 Agent 信息架构和领域模型上投入。

## What Changes

- **BREAKING**：本 change 成为 Agent Fabric 当前唯一产品与实施权威；既有 change 只保留在 `openspec/changes/archive/`，普通产品源码、部署目录和文档树不得继续保存其专用实现或设计。Git 历史与 `docs/history/README.md` 提供必要审计索引，历史未完成任务不得继续驱动开发。
- **BREAKING**：移除“一个账号只能创建一个 Agent”的全栈约束，账号与 Agent 改为一对多；废止单数 `agent` Desktop Snapshot、`single-agent-only` Cloud/Edge 存储和“我的 Agent / Agent 好友 / 消息动态”三页式默认产品结构。
- 以固定研究提交 `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7` 的 Multica Agents 模块为功能、信息架构和交互基准，clean-room 重建 Agent 列表、创建、AI Builder、模板、详情、配置、权限、状态、活动、归档恢复和批量管理能力。
- 不引入面向用户的 Workspace 概念；使用 Account 作为登录、成员、Runtime、Agent 和权限的唯一租户边界，并把 Multica 的 workspace-wide 语义映射为 account-wide。
- 提供 Google 登录、账号成员邀请/接受/移除/角色管理，以及独立 Runtime 列表、检测、绑定和生命周期管理，使 Agents 主流程可以完整运行。
- Agent 直接保存当前可编辑配置和运行绑定；本阶段不建设独立 AgentSpec、Revision、Deployment、发布版本、回滚或持久化 Agent Card 产品模型。标准 A2A Agent Card 由当前可调用 Agent 数据按需投影。
- 在 Multica Agents 能力之上仅新增一条产品能力：Codex 等本地 Agent 通过 MCP 列出/查找当前账号有权调用的 Agent，向目标 Agent 发起标准 A2A 对话，并读取 Task 和回复；MCP 不获得管理权限。
- 重建 Desktop App Shell、登录、Agents、创建工作室、Agent 详情、Runtime 和成员界面，使页面组织、信息密度、状态反馈和交互完成度尽可能接近 Multica，同时保持 Agent Fabric 品牌、文案、Token、组件和源码完全独立。
- 完成首个官网直装形态的 macOS Apple Silicon 发行候选 `0.1.0-beta.1`：使用注册的 `ai.agentfabric.desktop` Bundle ID、Developer ID Application、Hardened Runtime、Apple notarization 和 stapled DMG，并以真实隔离下载路径的首次启动证明发行信任链；该候选尚未提供给外部用户。
- 建立 GitHub Changelog 发布模块：用户可见变更以仓库内可审查条目为源，版本发布时生成持久 `CHANGELOG.md` 记录和分类 GitHub Release Notes；版本不一致、内容为空或生成失败时不得发布。
- 在首个尚未对外分发的 Desktop beta 中加入可信自动更新：固定公开 GitHub Releases beta 更新源，后台检查并下载签名、公证的 macOS 更新，提供手动检查、稍后处理和显式重启安装，并在 Runtime/MCP 安全停止后完成替换与恢复。DMG、更新 ZIP、元数据、blockmap、版本、架构和校验和必须作为同一 draft Release 原子验收后再发布。
- 保留标准 A2A 外部数据面、Edge Runtime Adapter 和敏感数据边界：Runtime session ID、cwd、模型凭据和私有 Runtime 上下文不得离开 Edge。

明确非目标：Workspace 产品、项目、任务板、通用聊天、Inbox、Autopilot、统计大盘、AgentSpec/Revision/Deployment 发布体系、Agent 或 App 自动降级/版本回滚、强制重启更新、Mac App Store、Cloud 托管 Runtime 或模型凭据，以及复制/导入 Multica 源码、资产、品牌、文案、CSS Token、组件 API、类名或像素几何。

## Capabilities

### New Capabilities

- `product-authority`: 冻结本 change 为唯一产品目标，定义历史计划的失效方式、默认产品入口和 clean-room 来源策略。
- `account-authentication`: Google 登录、会话恢复、退出和登录失败恢复。
- `account-members`: 无 Workspace 前提下的账号成员、邀请、角色、移除及其权限清理。
- `runtime-management`: Runtime 发现、列表、状态、创建/编辑/删除、可见性以及 Agent 绑定/解绑。
- `agent-catalog`: 多 Agent 领域模型、目录查询、搜索、范围、筛选、排序、批量选择、归档与恢复。
- `agent-creation`: 空白创建、模板创建、AI Builder、草稿自动保存/恢复和创建提交。
- `agent-configuration`: Agent 身份、Instructions、模型、Thinking、并发、Skills、Runtime Skills、环境变量、启动参数、Runtime 配置、Agent 侧 MCP 和集成配置。
- `agent-access-presence`: Owner、管理权限、调用范围、成员目标、真实在线/工作状态、最近活跃、运行次数和 Agent 活动。
- `codex-mcp-a2a`: 本地 Codex MCP 对可访问 Agent 的发现、标准 A2A 提问、Task 查询、超时续取和权限隔离。
- `multica-aligned-product-ui`: 登录、App Shell、Agents 目录、创建工作室、Agent 详情、Runtime 与成员管理的 Multica 对齐交互和视觉验收，以及 Desktop 本地可信自动更新体验和发行资产契约。

### Modified Capabilities

- `isolated-self-test`: 自测必须在多 Agent、统一访问权限和标准 Codex MCP/A2A 路径下运行，不得依赖单 Personal Agent 或 Agent 好友专用模型。

## Impact

- 产品 UI：`apps/desktop` 的 PRODUCT/DESIGN 权威、Renderer 路由、App Shell、状态模型、组件系统和全部核心页面需要重建。
- macOS 发行：Desktop 版本、正式图标、签名/权限、公证、DMG、自动更新 ZIP/元数据/blockmap、Gatekeeper、隔离首次启动和真实跨版本更新验证成为当前产品交付的一部分；Mac App Store 暂不在范围内。
- GitHub 发行：新增 Changelog 条目约定、版本切分/校验脚本、分类 Release Notes 配置、PR 提示和草稿 Release 工作流；公开 Release 同时作为首期 beta 更新源，必须在签名、公证、全部更新资产上传回读和真实安装验收后一次性发布，且不得向 App 注入私有仓库 Token。
- Desktop Shell：新增仅在 packaged App 启用的 updater 主进程、受限 preload IPC、本地自动更新偏好、应用菜单手动检查、全局就绪通知和与 Runtime/MCP 退出生命周期协调的安装路径；不新增 Account/Cloud 更新消息模型。
- Control Plane：账号、成员、邀请、Agent、权限目标、Runtime、活动和 A2A 查询 API 需要统一建模；现有单 Agent Directory 与好友专用路径退出默认产品。
- Edge Host / Runtime Adapter：本地配置和 Runtime 执行从单 Agent 改为多 Agent，按目标 Agent 隔离状态、会话和运行配置。
- MCP / A2A：MCP 改为账号权限下的 Agent 发现与 A2A Client 薄工具；A2A 继续使用标准 Message、Task、Artifact 和按需 Agent Card。
- 持久化：MySQL 为当前商业路径，新增 Account 范围的 Agent、Runtime、成员、邀请、调用目标、Builder 草稿、Skill 关联和活动数据；不得以仅内存实现作为交付。
- 兼容性：允许安全复用现有 Google 登录、A2A、Runtime Adapter 和 MCP 代码，但所有复用必须服从新模型；不保证历史默认 UI、IPC、单 Agent API 或好友专用 MCP 工具兼容。
- 供应链：Multica 仍只能作为仓库外只读研究证据，`config/third-party-sources.json` 与 source-policy 必须阻止任何 Multica 源码或依赖进入产品树。
- 仓库结构：删除 Matrix/Messenger、Personal Agent/Friends、Atlas/ContextCapsule、旧 Control Plane/PostgreSQL/Compose、旧 CLI 发布/加入路径及其专用 Spike/文档；仅保留仍被当前 Account Agents 代码真实引用的 Runtime/A2A/Google/安全原语。
