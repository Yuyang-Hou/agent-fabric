# replace-account-members-with-friends

## Why

当前产品把邀请对象加入同一个 Account，并通过 `owner/admin/member` 角色同时承载资源所有、管理和 Agent 调用权限；这与目标产品不一致。目标是让每位 Human 始终拥有独立的个人 Account，双方通过明确接受邀请建立双向好友关系，再由每个 Agent 的 Owner 决定该 Agent 是否可被好友发现和调用。

## What Changes

- **BREAKING**：将当前唯一产品权威从“共享 Account 成员协作”改为“个人 Account + Human 好友 + Agent 好友访问”；`multica-aligned-agents-product` 完成的成员、角色和同 Account 调用模型只保留为迁移证据，不再驱动实现或发布验收。
- **BREAKING**：Desktop 主导航“成员”改为“好友”，删除成员/管理员角色、角色编辑、成员资源转移和加入他人 Account 的产品行为。
- **BREAKING**：全量下线 Agent 草稿能力。AI Builder 改为 Desktop/Edge 内的纯本地一次性会话，进入、输入、Runtime 选择、多轮推理和预览均不得调用 Cloud Builder/草稿接口，也不跨离开或重启恢复。
- AI Builder 直接调用 Owner 选择的本机 Runtime；只有用户点击“创建智能体”且本地校验通过后，Desktop 才向 Account Server 发起一次完整 Agent 创建请求，并在成功后进入 Agent 详情。
- 每位 Google Human 始终登录自己的个人 Account；好友不会加入、拥有或管理对方 Account、Agent、Runtime、Skill、配置、凭据或活动。
- 增加 Human 级好友邀请收件箱：邀请人按邮箱创建无角色邀请；被邀请人登录自己的 Account 后可查看邀请记录，并明确接受或拒绝；邀请人可查看和撤销待处理邀请。
- 接受邀请后创建唯一、双向、可撤销的 Human Friendship；拒绝、过期、撤销、自邀、重复和并发接受均使用显式且防枚举的状态转换。
- Agent 访问模式在首期收敛为“仅自己”与“好友可访问”。只有有效好友可以发现和调用 Owner 明确开放的 Agent；删除好友或关闭访问后，未来发现、调用和 Task 读取立即被拒绝。
- 好友开放的 Agent 同时出现在好友侧 Desktop 的 Agent 管理目录中，但只展示安全的公开摘要、Owner、可用性和只读访问状态；好友不能进入管理型配置、Activity、Runtime、Skill 或秘密界面。
- 保留 `list_agents`、`find_agent`、`ask_agent`、`get_task` 四个 MCP 工具和标准 A2A 数据面，把授权从“同 Account member”改为“Owner 或有效好友且 Agent 已开放”。
- Account 继续作为单个 Human 的资源与 Runtime 隔离边界；首期不提供 Account 切换、团队共同所有、管理员、指定好友授权、公共 Agent 目录、App 内聊天或好友间 Runtime 共享。
- 现有成员、邀请和访问数据采用拒绝扩权迁移：所有非私有 Agent 先迁为私有，待处理成员邀请不自动建立好友；真实非 Owner 成员和其资源在迁移前必须审计并显式处置。
- 真实双 Human 验收使用已签名、公证并通过 macOS 首启安全检查的公开 beta 自测候选；候选可以先作为 GitHub Pre-release 发布和安装，但在好友链路、撤权与更新验收完成前不得冒充最终发布批准。

## Capabilities

### New Capabilities

- `human-friendships`: Human 好友邀请收件箱、接受/拒绝/撤销、双向好友、删除撤权、状态同步与隐私边界。

### Modified Capabilities

- `product-authority`: 当前产品权威从 Account 成员协作切换为个人 Account、Human 好友和好友开放 Agent。
- `account-authentication`: Google 登录始终恢复或创建当前 Human 的个人 Account，不再通过邀请加入他人 Account。
- `account-members`: 移除成员、角色、成员邀请、角色变更和成员资源转移产品能力，只保留迁移兼容边界。
- `agent-catalog`: Desktop 目录同时展示自己管理的 Agent 与好友开放的只读 Agent，并清楚区分管理权和调用权。
- `agent-creation`: 只有个人 Account Owner 可以创建 Agent；AI Builder 使用纯本地一次性会话，并只在最终创建时提交一次完整配置。
- `agent-configuration`: 只有 Agent Owner 可以修改配置、Runtime、Skill、秘密和访问模式；好友只能读取安全公开摘要。
- `agent-access-presence`: 调用授权从 Account/member target 改为 Human Friendship + Agent 好友访问开关，并支持跨 Account 的即时撤权。
- `runtime-management`: Runtime 只属于并服务于当前 Human 的个人 Account；AI Builder 由 Desktop/Edge 直接调用本机 Runtime，好友不能查看、绑定或管理。
- `codex-mcp-a2a`: MCP 跨个人 Account 发现和调用好友开放的 Agent，并按当前好友关系重新校验 Task 读取。
- `isolated-self-test`: 自动化自测继续验证 Owner 闭环，真实发布验收新增双账号好友邀请、开放 Agent 和撤权链路。
- `multica-aligned-product-ui`: App Shell 第三个目的地改为好友，Agents 目录增加好友开放只读行，删除所有成员角色、资源转移、继续草稿和草稿恢复交互。

## Impact

- Product authority / docs：`openspec/CURRENT.md`、根规格、`ARCHITECTURE.md`、README、Desktop PRODUCT/DESIGN、默认产品配置和发布 Gate。
- Domain / persistence：Account session、成员/邀请 schema、Human Friendship、新邀请表、Agent 访问模式、跨 Account A2A Task origin、迁移与审计事件；AgentDraft 运行时模型和持久化路径退出，旧表与历史数据按可回滚方案保留后再另行清理。
- Account Server APIs：新增好友邀请/好友查询与状态转换 API；移除默认成员、角色、资源转移及 `/v1/agent-drafts*` API；失效通知从 Account-only 扩展为精确 Human/Friendship 事件。
- Desktop：Renderer Snapshot、IPC、Host、导航、好友收发邀请、好友列表、Agent 目录分区、只读好友 Agent 详情和访问设置；Builder 状态改为本地内存并直接通过 Edge 调用 Runtime。
- MCP / A2A：保留四工具与标准 A2A v1.0.1，改造 Agent discovery、send、Task read 和删除好友/关闭访问后的即时拒绝。
- Edge Host / Runtime Adapter：增加本地 Builder 一次性会话执行，保留每 Agent/Builder 会话隔离；不向 Cloud、好友或 Renderer 暴露 Runtime session ID、cwd、凭据、私有上下文或管理端口。
- 非目标：Builder 草稿保存或恢复、Cloud Builder 编排、App 内聊天、Human 消息、群组/共同 Account、角色、指定好友列表、公共发现、跨账号资源转移、好友 Runtime 访问、Cloud Runtime、移动端、Marketplace 和兼容历史好友专用 MCP 工具。
