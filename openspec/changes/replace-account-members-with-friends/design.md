## Context

当前实现把 Account 同时作为资源租户与多人协作边界：Google 邀请会创建 `account_memberships`，Session 携带 Account/role，Agent/Runtime Owner 必须是同 Account member，Agent 调用目标只能是同 Account 或成员，A2A Task 的 origin 也通过同 Account membership 外键约束。Desktop 因而包含成员邀请、角色编辑、资源转移和成员移除。

新的产品目标保留 Account 对 Agent、Runtime、Skill 和本机 Edge 的资源隔离，但 Account 变为一个 Human 的个人资源容器。人与人通过独立、双向的 Human Friendship 建联；Friendship 不产生资源所有权或管理权。每个 Agent 的 Owner 只选择“仅自己”或“好友可访问”，好友通过 Desktop 的 Agent 目录读取安全摘要，并通过现有 MCP/A2A 问答。

历史 `minimal-agent-friend-messaging` 证明过邀请、撤权、Presence、A2A 和 Runtime 隔离原语，但其关系是单 Personal Agent pair、依赖邀请码消费且没有收件箱。该模型只作测试与安全经验，不作为数据模型或 API 兼容目标。

## Goals / Non-Goals

**Goals:**

- 每个 Human 始终恢复或创建自己的单一个人 Account，不因好友邀请进入他人 Account。
- 提供由受邀 Google 身份可见的收件箱式邀请、显式接受/拒绝、双向好友和删除撤权。
- 让 Owner 按 Agent 选择是否对全部有效好友开放，默认私有且迁移拒绝扩权。
- 让好友在 Desktop Agent 管理目录看到开放 Agent 的安全只读摘要，同时禁止一切管理、Runtime、秘密和活动访问。
- 让现有四工具 MCP 和标准 A2A 在跨个人 Account 场景中使用同一好友授权真源，并在关系或开关变化后即时拒绝。
- 保留 Runtime session ID、cwd、凭据、环境值、私有配置和上下文只在 Edge 的边界。

**Non-Goals:**

- 不做共享 Account、团队角色、管理员、资源共同所有、Account 切换或跨账号资源转移。
- 不做指定好友授权、公共 Agent 目录、好友搜索推荐、群组、App 内聊天或 Human 消息。
- 不让好友查看或管理 Runtime、Skills、Instructions、模型私有配置、环境变量、凭据、Activity 明细或本地文件。
- 不恢复历史 `list_agent_friends/send_message/get_message` MCP 工具，也不引入 A2A 私有顶层字段。

## Decisions

### 1. Account 保留为个人资源边界，Friendship 独立于 Account

每个 Human 只有一个当前个人 Account；Agent、Runtime、Skill、Builder 草稿和本地 Host 仍由该 Account 隔离。过渡期保留 `account_memberships`，但每个 Account 只能存在一个 `owner` 行，成员/管理员 API 和 UI 全部退出。这样可以在不一次性重建 Agent/Runtime 复合外键的前提下消除跨 Human 的 Account 权限。

备选方案是彻底删除 Account 并让所有资源直接以 Human 为租户。它会同时改写 Runtime tunnel、Edge registration、Agent catalog、Skill、Builder 和发行证据，风险高且不能改善当前用户体验，因此拒绝。

### 2. Friendship 是 Human 对 Human 的规范化双向关系

新增 `human_friendships`，以排序后的 `(user_low_id, user_high_id)` 唯一标识一对 Human，状态为 `active` 或 `revoked`，保存来源邀请、版本和时间。关系不绑定 Agent：同一好友可以看到 Owner 后续开放的任意 Agent，无需为每对 Agent 建立 Friendship。

备选的 Agent-pair Friendship 与多 Agent 产品冲突，会要求每次新增 Agent 重复建联，因此拒绝。

### 3. 邀请是 Principal 级收件箱记录，不以秘密 Token 作为产品入口

新增 `human_friend_invitations`，包含 inviter、受邀邮箱摘要、可选已解析 invitee user、`pending/accepted/rejected/revoked/expired`、版本和时间。创建成功只返回安全记录；不把原始 Token送入 Renderer、剪贴板或普通日志。

登录后，Server 依据受信 Google Identity 映射的 Human 与已验证邮箱匹配收到的邀请。未注册收件人在首次登录并创建自己的 Account 后即可看到邀请。接受事务锁定邀请与规范化 pair，创建或恢复 Friendship 并把邀请置为 accepted；拒绝、撤销和过期不创建关系。接受后关系以 Human ID 为稳定身份，不因邮箱改变而漂移。

API 分为 `/v1/friend-invitations/incoming`、`/outgoing`、创建、接受、拒绝、撤销，以及 `/v1/friends` 列表/删除。所有写操作只允许 Desktop Human session；MCP 和 A2A 不暴露好友管理。

备选的邀请码粘贴/链接消费无法满足“被邀请人看到记录并点击接受”，且把秘密搬运责任交给用户，因此拒绝。

### 4. P0 Agent 访问只有 `private` 与 `friends`

Agent 的访问模式改为：

- `private`：仅 `ownerUserId` 可发现和调用。
- `friends`：Owner 与所有当前 `active` Human 好友可发现和调用。

首期不保留 Account target、member target 或指定好友 target。访问更新只允许 Agent Owner，且使用 optimistic concurrency。数据库查询、A2A Gateway、MCP discovery、send 和 Task read 必须调用同一授权模块：

`owner || (agent.accessMode == friends && activeFriendship(ownerUserId, callerUserId))`

归档、无 Runtime、离线和自测 bounded credential 继续作为正交限制。Friendship 删除、Agent 设回 private、归档或凭据撤销后，下一次发现/发送/读取立即失败；尚未进入 Runtime 的工作拒绝，运行中工作尽力取消且结果不再可读。

备选的指定好友授权更灵活，但用户当前只要求按 Agent 判断好友是否可访问；现在引入会增加选择器、Grant 迁移和撤权矩阵，因此延后。

### 5. Desktop Agent 目录区分“我的”与“好友开放”

Agents 页面提供 `mine`、`friends`、`archived` 三个范围。`mine` 和 `archived` 只包含自己的 Agent 并提供既有管理能力；`friends` 只包含当前好友开放且可调用的 Agent。

好友 Agent 行和只读详情只投影：Agent ID、名称、描述、Owner 显示名、公开能力摘要、在线/离线/未绑定状态和“好友开放”访问标签。它不返回 Runtime 名称/ID、模型、Instructions、Skills 内容、活动统计、工作负载、配置版本、环境摘要或任何编辑/归档/批量操作。好友关系消失后，该行通过 Human-scoped invalidation 移除。

Friends 页面提供好友、收到邀请、发出邀请三个集合；删除好友只说明调用权影响，不展示资源转移流程。Desktop 不增加消息输入框。

### 6. Runtime、Agent 创建和配置改为个人 Owner 权限

登录 Human 是其个人 Account 的唯一产品 Owner。只有本人可创建 Agent、管理 Runtime、编辑 Agent、查看 Activity/Skills/秘密和删除资源。Runtime 不再有面向其他成员的 `public/account` 可见性；过渡数据统一迁为 private。

好友只拥有 `canInvokeAgent`，永远不满足 `canManageAgent`、`canBindRuntime` 或 secret/activity authorization。服务端必须独立复核，不能依赖 Renderer 隐藏控件。

### 7. A2A Task 同时记录目标资源 Account 与独立 origin Human

`account_agent_a2a_tasks.account_id` 继续表示目标 Agent 的资源 Account；`origin_user_id` 改为只关联 Human Principal，不再要求 origin 是目标 Account member，并增加 `origin_account_id` 作为审计/路由元数据。创建 Task 前查询目标 Agent 后执行统一好友授权；Task read 同时校验 origin credential/user、目标 Agent 和当前 Friendship/accessMode。

A2A Message、Task、TaskState、Artifact 和 Agent Card 保持 v1.0.1 标准形状。好友/Account 路由属于认证与 Control Plane 上下文，不添加到标准对象顶层。

### 8. 失效通知按 Human 精确投递

现有 Account invalidation 继续服务 Owner 资源变更；新增 Human/Friendship invalidation channel，用于收到邀请、邀请状态、好友建立/删除以及好友开放 Agent 的 access/presence 变化。Server 不向非关系用户广播好友或 Agent 元数据。Desktop 在重连后以完整 incoming/outgoing/friends/friend-agent 查询重建，不以事件流作为唯一真源。

### 9. 迁移默认收紧权限且可回滚

迁移先新增表/列和双读代码，再切换写入与产品入口，最后停用旧 API。所有现有 `account`/`targeted` Agent 迁为 `private`；Runtime 迁为 private；待处理成员邀请置为 revoked/expired，不自动建立 Friendship。

部署前执行只读审计：每 Account owner/member 数、非 Owner 拥有的 Agent/Runtime、有效成员 Session、待处理邀请和非私有访问目标。如果不存在真实非 Owner 数据，直接收敛为一人一 Account；如果存在，发布暂停并生成有界迁移计划：为每个 Human 建立个人 Account、按现有 `owner_user_id` 移动其资源、撤销旧 Session，并创建待接受的好友邀请，不静默建立关系。

旧表至少保留一个发布版本且不再被产品写入；迁移失败回滚到旧二进制时，新 Friendship 数据保持旁路，不提升旧权限。删除旧表必须另行通过迁移验证和备份门禁。

### 10. 新 change 成为唯一产品权威

完成 proposal/design/spec/tasks 后，更新 `openspec/CURRENT.md`、主 specs、默认产品配置、PRODUCT、ARCHITECTURE、README 和发布 Gate，使 `replace-account-members-with-friends` 成为唯一活动目标。当前 `multica-aligned-agents-product` 归档为已交付基线/迁移证据，未完成的 member real-acceptance 与发布任务不得继续冒充新产品验收。

## Risks / Trade-offs

- [跨 Account 查询扩大枚举面] → 只从已验证 Human 关系出发查询，未授权与不存在统一返回，禁止公共名称/邮箱搜索。
- [好友 Agent 详情泄漏私有配置] → 使用独立 friend projection schema 和查询，不复用 Owner detail 后在 Renderer 删字段。
- [关闭访问或删好友后仍读到缓存结果] → discovery/send/get_task 每次复核，Human invalidation 主动清缓存，客户端错误不回退旧快照。
- [旧 `account` 权限迁成 `friends` 意外扩大到未来好友] → 所有旧非私有模式强制迁为 private，由 Owner 重新开启。
- [成员实际拥有资源导致一人一 Account 迁移困难] → 发布前只读审计；检测到真实数据即暂停自动切换并生成显式迁移计划。
- [保留内部 owner membership 继续造成术语漂移] → 不再暴露 role/member API；后续仅在稳定迁移后删除兼容表，不让内部实现反向定义产品。
- [好友可调用意味着远端文本进入本机 Runtime] → 继续标记外部输入为不可信，Runtime 默认只读/无网络/无副作用，私有 Session 按目标 Agent 与来源 Human 隔离。

## Migration Plan

1. 新增 Friendship、Invitation、Agent access mode 和跨 Account Task schema，保持旧产品可运行。
2. 发布只读审计工具并在测试/目标数据库记录红acted 计数；非 Owner 数据触发人工迁移门禁。
3. 实现统一好友授权与新 API，完成 Fake 双账号契约测试，但暂不切默认 UI。
4. 更新 Desktop、MCP、A2A 和 invalidation，默认把旧访问映射为 private。
5. 切换 `CURRENT.md`、主 specs 和 default-product Gate，禁用旧 member mutation 路由。
6. 完成两 Google 账号/两隔离设备真实验收与撤权检查后，才允许签名、公证和发布。
7. 至少保留一个版本的旧表只读备份；确认无回滚需求后另立清理任务。

## Open Questions

无阻塞问题。P0 固定为 Human 双向好友、按邮箱邀请收件箱、每 Agent 全好友开关、Desktop 好友 Agent 安全摘要和现有四工具 MCP；指定好友与通知邮件延后。
