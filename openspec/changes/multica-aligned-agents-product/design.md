> Change authority: `multica-aligned-agents-product`

## Context

当前默认产品由 `minimal-agent-friend-messaging` 驱动，Cloud Directory、Edge 配置存储、Desktop IPC 和 MCP 都围绕一个 Human 只能拥有一个 Personal Agent 建模。Renderer 固定为“我的 Agent / Agent 好友 / 消息动态”，缺少 Multica Agents 已经证明可用的目录、创建工作室、详情设置、Runtime 与成员协作体系。

本 change 是一次产品与领域模型替换，而非在现有页面上增量加功能。历史实现中可独立复用的 Google OIDC、A2A SDK、Runtime Adapter、Edge 隔离、MCP JSON-RPC 和 MySQL 设施可以保留；单 Agent、Friendship 专用权限、Revision 发布、旧 UI/IPC/API 语义不得成为兼容包袱。

研究权威固定为仓库外 `/Users/hyy/project/multica` 的提交 `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7`。研究对象包括 Agents 列表与工具栏、创建方式选择、手动创建、模板、AI Builder 与草稿、Agent 详情四区、权限、Runtime、Skills、环境变量、MCP/Integrations、活动和归档恢复。Multica 只提供功能和交互证据；产品代码必须 clean-room 重建。

产品没有面向用户的 Workspace。为保留 Multica 的协作语义，Account 同时承担租户、成员和资源作用域。用户登录后只进入自己的 Account；本 change 不建设多 Account 切换。

### 目标关系

```text
Account
├── Members / Invitations
├── Runtimes
└── Agents
    ├── InvocationTargets
    ├── Skills / DisabledRuntimeSkills
    ├── BuilderDrafts
    └── Activities / A2A Tasks

Codex → local MCP → Account identity → canInvoke(Agent)
      → standard A2A Client → target Edge/Runtime → Task/Artifact
```

### 信任与数据边界

| 数据 | Cloud / MySQL | Edge Host | Renderer / MCP |
| --- | --- | --- | --- |
| Account、成员、邀请、角色 | 保存 | 最小缓存 | 授权投影 |
| Agent 身份、当前配置、权限、Runtime 绑定 | 保存非秘密字段 | 执行所需配置 | 按权限投影 |
| 环境变量、Credential 值、Runtime session ID、cwd、私有运行上下文 | 不保存 | 保存 | 不返回 |
| Runtime 状态与能力摘要 | 保存/更新摘要 | 真源 | 只读投影 |
| A2A Message/Task/Artifact | 路由与必要状态；不得默认长期保存原始正文 | 执行与必要本地记录 | MCP 返回授权结果 |

## Goals / Non-Goals

**Goals:**

- 交付与 Multica Agents 功能面完整对齐的多 Agent 产品，而非展示型壳层。
- 用 Account 替代 Workspace 作用域，完成登录、成员邀请、Runtime、Agent 权限和 MCP 访问的闭环。
- 让 Agent 列表、创建工作室、详情设置和状态反馈在信息架构、密度、交互路径和视觉完成度上尽可能接近 Multica。
- MCP 作为唯一额外能力，让 Codex 等本地 Agent 调用当前账号有权访问的 Agent，并使用标准 A2A Message、Task 与 Artifact。
- 迁移中保留可复用的真实 A2A、Google 登录、Runtime Adapter 和安全边界，同时使旧单 Agent 产品退出所有默认入口。
- 让首个对外 Desktop beta 自带可信自动更新能力，后续版本可以在不中断当前工作、不中转 Cloud 凭据的前提下完成检测、下载、通知和显式重启安装。

**Non-Goals:**

- 不建设 Workspace、Workspace 切换、项目、任务板、Inbox、Autopilot、Squad 或统计大盘。
- 不建设独立 AgentSpec、Revision、Deployment、发布、回滚或持久化 Agent Card 产品体系。
- 不把 App 变成通用聊天客户端；Agent 对话的新增入口仅为本地 MCP。
- 不通过 MCP 暴露登录、成员、Runtime、Agent 创建编辑、权限扩张或秘密读取能力。
- 不复制、翻译、修改、导入或依赖 Multica 源码、资产、品牌、文案、Token、类名、组件 API 或私有接口。
- 首期只承诺 Codex Runtime 的真实执行；数据模型与 Runtime UI 保持 provider-neutral，但不得展示尚未实现的 Provider 为可用。
- 不做强制重启、静默安装、App 自动降级/回滚、Mac App Store 分发或私有 GitHub Release Token 内嵌；已发布版本出现问题时发布更高版本修复。

## Decisions

### 1. 新 change 是唯一实施权威，历史材料只在归档与 Git 历史中保留

所有历史 OpenSpec change 只在 `openspec/changes/archive/` 中提供审计，其未完成任务全部停止。专用于旧产品的源码、部署文件、Spikes、Skills、ADR、验收与架构文档从普通产品树物理删除；Git 历史保存完整内容，`docs/history/README.md` 只保留名称、边界和恢复方式。根级产品文档、默认产品配置、README/Architecture 的“当前目标”入口和开发指令必须只指向本 change；CI 增加权威检查，拒绝历史根目录、默认产品旧引用、三页 Personal Agent 导航或 `single-agent-only`。

可复用的 A2A、Google OIDC、撤权、泄漏和打包行为必须由当前代码与当前测试直接承载，不能依赖旧产品文件继续存在。物理删除前先验证当前引用图并保护 dirty worktree；不再以“可能有用”为由把历史产品实现留在可被新会话搜索到的普通目录。

### 2. Account 是唯一租户边界，内部不保留伪 Workspace 产品概念

领域对象统一携带 `accountId`。Google 首次登录为 Human 建立或加入一个 Account；成员角色为 `owner | admin | member`。Account Owner/Admin 管理成员和全账号资源；普通成员只管理自己拥有的 Agent/Runtime，并按授权调用其他 Agent。

Multica 的 `workspace` invocation target 映射为 `account`，UI 文案显示“所有成员”；不向用户展示隐藏 Workspace，也不保留 workspace switcher。选择 Account 而不是隐式单人容器，是因为成员邀请和“全部 Agent”需要稳定共同作用域。

### 3. Agent 采用当前态直接模型，移除单 Agent 与发布版本层

`Agent` 是稳定 ID 的当前可编辑记录，主要字段包括：

- identity：`id, accountId, ownerId, name, description, avatarUrl`
- behavior：`instructions, model, thinkingLevel, serviceTier, maxConcurrentTasks`
- runtime：`runtimeId?, runtimeMode, runtimeConfig, customArgs`
- capabilities：workspace/account skills、disabled runtime skills、Agent 侧 MCP/Integration 配置摘要
- authorization：`permissionMode, invocationTargets`
- lifecycle：`archivedAt?, archivedBy?, createdAt, updatedAt`

账号与 Agent 为 1:N；任何层都不得保留 `Human → single Agent` 唯一索引。Runtime 可以为空；Agent 未绑定 Runtime 时保持配置但不可执行。A2A Agent Card 在请求时由当前 Agent 的公开字段和 Runtime 能力动态投影，不持久化为版本对象。

选择直接模型是用户明确的阶段性约束。代价是暂时没有发布快照、版本回滚和并行 Revision；配置更新的并发控制使用 `updatedAt`/ETag 乐观并发，秘密字段使用专用端点和遮罩投影。

### 4. Runtime 是独立 Account 资源，删除只解绑 Agent

`Runtime` 具有 owner、provider、adapter、设备、状态、健康原因、可见性和能力摘要。可见性独立于 Agent 调用权限：`private` 仅 Runtime Owner 和 Account Admin 可绑定，`public` 允许 Account 成员绑定。首期只有健康的 Codex Adapter 可被选择。

删除 Runtime 前服务端计算受影响 Agent；确认后取消或终止运行中任务、把用户 Agent 的 `runtimeId` 置空并保留配置/历史，再删除 Runtime。不得级联删除或归档用户 Agent。未绑定、离线、鉴权缺失和不支持能力是不同故障状态。

### 5. 管理权和调用权分离，所有入口共用一个授权函数

- `canManageAgent`：Agent Owner 或 Account Owner/Admin。
- `canInvokeAgent`：Agent Owner 始终允许；`private` 只允许 Owner；`public_to` 对 `account` 或精确 `member` 目标做 OR 匹配；目标必须仍是有效成员。
- `canBindRuntime`：Runtime Owner、Account Owner/Admin，或 Runtime 为 `public` 的有效成员。

Agent 列表、详情、创建、A2A Gateway 和 MCP 必须调用同一领域授权实现，不能在 UI、MCP 或路由层复制近似判断。成员被移除时，在同一事务中清理其 invocation targets、撤销会话/凭据、禁止未来调用；若其拥有 Agent/Runtime，必须先转移所有权或由管理员选择归档/解绑，不能遗留无 Owner 资源。

### 6. Presence、工作状态和活动分别建模

Agent 列表投影三个正交维度：

- lifecycle：active / archived
- availability：online / unstable / offline；未绑定 Runtime 单独显示 `needs_runtime`
- workload：working / queued / idle，来自真实非终态 A2A Task 数量

`archived` 和 `needs_runtime` 优先于 Presence；在线必须来自新鲜 Edge 连接、健康 Runtime 和 Agent/Runtime 绑定匹配。最近活跃和 30 天运行次数只来自完成/失败的真实 Task 聚合，未知时显示“—”，不得用 UI 定时器猜测。

### 7. 创建流程完整对齐 Multica 的三条路径

创建入口包含：空白创建、模板创建、AI Builder。三者汇入同一个 `AgentDraft` 和服务端校验器：

- 手动创建提供身份、Instructions、Runtime、模型、能力与访问配置。
- 模板创建以事务导入引用 Skills 并创建 Agent；失败不得留下半创建 Skill/Agent。
- AI Builder 使用隐藏的 server-backed builder session 与草稿；用户输入的未发送编辑也必须自动保存，刷新、切页或重启后可恢复。

最终 Create 是一次原子提交；Runtime 在提交前失效、权限变化或字段校验失败时保留草稿并给出可恢复错误。

### 8. Agent 详情按用户意图组织，秘密字段使用专用接口

详情主结构对齐 Multica：Overview、Activity、Capabilities、Settings。Capabilities 包含 Instructions、Skills、Agent 侧 MCP 与 Integrations；Settings 包含 General、Access、Environment、Custom Args、Runtime Config。只有 Runtime/Feature 实际支持时显示对应页签。

普通 GET Agent 只返回 `hasCustomEnv/keyCount`、`mcpConfigured/redacted` 等摘要。环境变量、Headers、Token 和 Credential 值不得进入常规 Agent payload、日志或 Renderer 快照；Reveal/Update 使用 Owner/Admin 专用、可审计的独立端点。所有编辑页签提供 dirty guard，避免切换时静默丢失修改。

### 9. Codex MCP 是同一权限系统上的薄 A2A Client

最终 MCP 工具面为：

- `list_agents`：列出当前账号身份可调用的 Agent 及公开摘要、真实状态。
- `find_agent`：按名称/能力查询可调用 Agent，不返回无权 Agent 的存在性。
- `ask_agent`：向精确目标 Agent 发送标准 A2A Message；在有界时间内返回终态 Task/文本 Artifact，未终态时返回 Task ID。
- `get_task`：只读取当前 MCP Principal 发起且仍有权读取的 Task。

MCP 使用当前登录账号/设备的独立最小凭据，不能选择或冒充某个 Owner Agent，也不维持好友专用目录。A2A Gateway 在每次 Message 和 Task 读取时重新执行 `canInvokeAgent`，撤权立即阻止后续请求。HTTP 200 但 TaskState 为失败不视为成功；只把 `text/plain` Artifact 作为当前问答结果返回。

隔离自测由已登录 Owner 显式选择一个在线 Agent 后签发最长 15 分钟、只含 `account:self-test` Scope 且绑定精确 Agent ID 的临时 Device Credential。该凭据不能访问 Agent、Runtime 或 Members 管理路由，只能经上述 MCP 工具进入共享标准 A2A 路径；自测在内存中完成发现、问答、Task 回读、撤权和撤权后拒绝验证，不再借用历史 Invitation/Grant/Revision 或第二次 Google 登录。

### 10. API、IPC 与缓存以集合和目标 ID 为中心

Control Plane 使用 Agent Fabric 独立设计的 Account-scoped REST 资源：`/v1/agents`、`/v1/agent-drafts`、`/v1/runtimes`、`/v1/members`、`/v1/member-invitations`、专用 secrets/self-test 端点及标准 A2A 路由；Account ID 只从认证会话派生，客户端不得通过路径或参数选择账号。列表支持服务端归档范围、搜索、筛选、排序和稳定分页，响应必须包含构造行所需的稳定投影，避免单元格 N+1。

Desktop preload 暴露严格 schema 的 query/mutation API 或集合 Snapshot；所有变更命令携带目标 ID。Renderer 不直接持有 Cloud/Edge/MCP 凭据。TanStack Query/等价缓存按 Account 和资源 ID 建键，WebSocket/IPC 事件只失效受影响集合和详情。

详情导航不得等待 Cloud 查询。Desktop 在用户打开 Agent 时先切换到目标路由，并使用目录行中的安全身份、状态、Owner、Runtime 与模型投影构造详情加载框架；Agent 详情、活动和 Skills 作为三个独立片段在后台加载并按 Agent ID 保留于当前登录会话的内存缓存。详情页签切换只改变本地路由区段，不得重新发起已完成的片段查询。缓存不跨登录持久化，普通导航不得使秘密字段进入 Renderer Snapshot。

### 11. Multica 对齐是可验证的产品要求，不是源代码复用许可

视觉与交互模式采用 Operate：macOS 原生感外壳、紧凑分组导航、安静中性色、内嵌主画布、集合页 Header、密集两行 Agent 行、列表—详情、结构化设置行、单任务登录卡。Agents 页对齐 Multica 的搜索、我的/全部/已归档、筛选、排序、可配置列、批量选择和行操作；创建与详情保持相同层级和状态反馈。

Desktop 交互组件只采用一套成熟原语层：`@base-ui/react` 负责 Select、Combobox、Menu、Popover、Dialog、Sheet、Checkbox、Tabs、Tooltip 与 Field 的键盘、焦点、Portal 和碰撞行为；视觉配方优先使用经审查的 shadcn/ui Base UI 组件并收敛到 Agent Fabric 语义 Token，不再为同类控件手写开关状态、焦点圈、点击外部关闭或弹层定位。Sonner 与 Lucide 保持为反馈和图标层；不得并行引入 Radix、Material UI 或另一套视觉系统。第三方包及进入产品树的生成源码必须登记并通过 source-policy。

文本输入的可见焦点由共享控件外壳统一绘制，嵌套在搜索框中的原生 `input` 不得再叠加带 offset 的第二层焦点圈。Members 的搜索、成员行、邀请行和底部计数组成同一个满高集合表面。Electron 顶部安全区必须横跨窗口提供 macOS drag region，同时所有交互控件维持 no-drag；应用根布局使用窗口内容区的完整高度，不依赖初始动态视口快照。

Agents、Runtimes 与 Members 使用共享满高集合视口。集合 Header、工具栏和列头保持稳定，数据行在剩余高度内滚动，选择/计数/分页反馈位于集合底部；少量数据留下的空间必须属于边界明确的数据区域，不得表现为列表卡片结束后的未完成白页，也不得用统计大盘、虚构卡片或无关功能填充。集合列、排序、筛选、选择和可见性由稳定版 TanStack Table React Adapter 管理，服务端查询和权限结果仍为真源。

实施前必须为登录、Agents 列表、创建方式、手动创建、AI Builder、Agent 详情、Runtime 列表/详情、成员列表/邀请制作独立 comp-first 组合，并由产品确认。产品树独立定义 Agent Fabric Token、组件 API、尺寸和文案；source-policy 扫描 `@multica/*`、品牌、路径、类名和资产指纹。

视觉验收不是像素复制，而是对每个参考表面比较：信息层级、内容密度、控件位置、交互步骤、空/加载/错误/权限/归档/离线状态和窄宽行为。Desktop 目标窗口与 1280×800、1440×900、1728×1117 视口截图必须审查；窄宽至少验证 768 和 414，列表—详情在窄宽切换而非同时压缩。最终只允许一轮 detector、一次成组视觉缺陷修复和一次确认回归。

### 12. 迁移采用新纵切替换默认产品，不在旧单 Agent API 上打补丁

1. 冻结新领域 schema、API、权限和设计 comps；CI 标记旧 change 为 superseded。
2. 新建 Account/Members/Runtimes/Agents 持久化和服务层，复用 Google/A2A/Runtime Adapter 的底层实现。
3. 把现有单 Personal Agent 数据迁移成 Account 下第一条 Agent：保留 ID、名称、描述、能力摘要和可映射 Runtime；不能安全映射的私有字段只保留 Edge，本地备份后提示用户补配。
4. 建立多 Agent Edge Host、Presence、A2A 和 MCP 纵切，并用 Fake Runtime 契约测试。
5. 重建 Renderer 和 IPC；新入口通过验收后一次性切换默认产品。
6. 旧 UI、Friendship 专用 MCP 和单 Agent Directory 只在迁移窗口保留，不双写；新产品验收后删除全部专用源码、部署与设计文档，仅保留归档 OpenSpec、Git 历史和审计索引。

回滚以发行物/分支切换为主，不把新多 Agent 数据反向压缩回单 Agent。迁移前保留可恢复备份；回滚旧发行物时新建的额外 Agent 不可见但不得删除。

### 13. 首版 macOS 发行候选证明官网直装信任链

首个签名发行候选固定为 `0.1.0-beta.1`，先验证 Apple Silicon `arm64`，Bundle ID 固定为已注册的 `ai.agentfabric.desktop`。该候选使用 Developer ID Application 签名、Hardened Runtime、Apple notarization 和 stapled DMG 完成内部信任链验收，但尚未提供给外部用户；首个真实外发 beta 还必须满足第 16 节自动更新基线。当前阶段不进入 Mac App Store，也不引入 App Store entitlement 或 provisioning profile 流程。

正式图标以当前产品中的无嘴柔和球体与双眼留白标记为唯一视觉来源，由 Agent Fabric 独立生成 1024×1024 源图和 `.icns`，不得继续使用 Electron 默认图标或旧机器人资产。证书身份由本机钥匙串自动发现，不把证书哈希、Team ID、Apple ID 或凭据提交到仓库；公证只引用已验证的钥匙串 profile `agent-fabric-notary`。

构建成功不是发布成功。发行脚本必须对最终 `.app` 和 DMG 执行签名校验，断言 Bundle ID、Developer ID authority、Team Identifier 与 Hardened Runtime；随后提交 DMG 公证、等待 `Accepted`、staple 并验证 ticket，再通过 Gatekeeper 评估。最后把 DMG 复制到独立下载目录并添加 quarantine 属性，从挂载卷复制 App 后完成真实首次启动；若系统要求用户点击“打开”，该系统确认是唯一允许暂停的人工边界。

发行证据只记录版本、架构、Bundle ID、签名/公证/Gatekeeper 结论和时间，不记录证书哈希、Apple 账号、Team ID、密码、token、钥匙串内容或本地私有路径。失败不得覆盖或宣传为可下载正式包。

### 14. GitHub Changelog 由用户可见条目和原生 Release Notes 共同生成

`CHANGELOG.md` 是跨版本、面向用户的持久历史；`changelog/unreleased/*.md` 是下一版本的可审查输入。每个条目只允许 `breaking`、`added`、`changed`、`fixed`、`security` 五类，正文必须是非空、单段、无内部 ID/凭据/绝对路径的用户可理解描述。直接提交和 PR 都使用同一输入，不把“是否经过 PR”当成能否进入发行说明的条件。

仓库提供无第三方运行时依赖的 Node.js 生成器。`check` 校验条目格式、敏感内容和版本一致性；`preview` 生成确定性的 Markdown 预览但不改仓库；`prepare <version>` 把未发布条目按固定顺序切入 `CHANGELOG.md`，生成该版本的 Release 正文，并在成功后清空已消费条目。版本必须与根包和 Desktop 包一致，已存在版本、空版本或脏生成结果 fail closed。首版 `0.1.0-beta.1` 作为已验证发行候选历史补录，不伪造 PR、提交来源或外部分发事实。

`.github/release.yml` 使用 GitHub 原生标签分类补充 PR/贡献者和完整比较链接；本地生成的用户可见摘要保持在 Release 正文顶部。`.github/pull_request_template.md` 提醒贡献者增加条目或说明 `changelog:skip` 理由。GitHub Actions 只在 Linux 上运行格式/一致性检查和生成预览；正式 DMG 仍由本机 Developer ID/公证流程产生，不把 Apple 凭据迁入 GitHub。

发行顺序固定为：合并并校验用户可见条目 → `prepare` 版本切分并提交 → 构建/签名/公证/首启验收 → 在 GitHub 创建或更新 draft Release、填入生成正文并上传已验证 DMG → 人工检查版本、正文、校验和与资产后发布。回滚只删除未发布的 draft Release 或恢复版本切分提交；已发布历史不重写，修正文案使用新提交并在 Release 中保留可追踪说明。

### 15. 应用内外共用一个单色 Agent Fabric 标记

当前品牌标记固定为一个无轮廓线、无嘴巴的柔和黑色球体，只保留两个竖向胶囊形留白眼睛。标记由 Agent Fabric 独立定义一份规范化矢量几何；打包图标、登录/恢复品牌标识、Agents 导航与页面状态、详情元数据及影响对话框均从该几何派生，不再混用旧机器人资产或通用 `Bot` 图形。

应用内 SVG 使用 `currentColor` 和真实透空的眼睛，使同一几何可在浅色或深色表面上单色反转；应用图标在白色 macOS 图标画布上使用黑色球体。不增加渐变、阴影、口型或额外装饰，并以 16px 尺寸仍能辨识两个眼睛为最小尺寸约束。1024 PNG 和 `.icns` 必须由这份矢量源生成，不将用户选定的参考截图直接当作多套品牌源。

### 16. 首个未外发 beta 作为可信自动更新基线

当前 Desktop 尚未提供给外部用户，`0.1.0-beta.2` 仍处于待发布状态，因此没有需要迁移的已安装旧客户端。首个实际分发的 beta 必须已经包含 updater；它是后续自动更新的基线，不为此前仅内部使用、没有 updater 的构建提供远程迁移或兼容承诺。发布前若版本号继续前进，应保持同一原则，由首个真实外发版本承担 bootstrap。

首期更新源固定为公开 GitHub Releases 的 macOS Apple Silicon beta 通道，与现有个人 GitHub draft Release 流程共用版本和 Changelog 真源。生产 App 不接受 Renderer、环境变量或 Account Server 动态指定 feed，不嵌入 GitHub Token，也不访问私有 Release；若未来需要暂停、分批或私有分发，应通过后续 OpenSpec 改为独立 HTTPS 静态更新源，而不是扩大当前 IPC 权限。

updater 只在 `app.isPackaged` 的正式包中启用。自动更新默认开启，启动约 5 秒后进行一次非阻塞检查，长时间运行时每小时检查一次；本地偏好以原子文件保存在 Electron `userData`，关闭自动更新会取消未来定时器，但应用菜单中的显式“检查更新…”始终可用。启动、周期和手动触发共用 single-flight 检查，避免并发下载。自动下载开启，自动安装退出关闭，由 Agent Fabric 自己的生命周期协调器决定何时安装。

主进程持有更新源、文件和安装权限，并维护 `idle | checking | downloading | ready | installing | up-to-date | error` 状态。preload 只暴露经过严格 Schema 校验的当前状态、自动更新偏好、手动检查、订阅和安装命令；Renderer 不接收 feed URL、下载路径、Token 或任意文件能力。Release Notes 只显示仓库生成的用户可见纯文本摘要，不渲染远端 HTML。检查和下载不依赖登录，不创建 Account 消息、Agent Activity 或 Cloud 更新记录。

更新下载完成后，前台 App 显示全局“稍后 / 重新启动并更新”通知；窗口隐藏时额外发送本机系统通知，重新打开后仍可看到 ready 状态。“稍后”不得中断正在运行的 Agent 或 Runtime；用户主动重新启动或完全退出时，生命周期协调器只执行一次 Runtime、MCP 和 Adapter 停止，成功后调用 updater 安装并重新拉起。更新失败、取消或退出清理失败时保留可启动的旧 App，显示可重试错误，不把“已发现版本”或“已下载”冒充安装完成。

每个更新 Release 必须先保持 draft，并同时包含同版本、同 arm64 架构的 Developer ID 签名与 Apple 公证 App、手动安装 DMG、自动更新 ZIP、通道元数据和 blockmap。发布门禁校验资产名称、版本、架构、SHA-512、元数据引用、签名、公证、staple、Gatekeeper 和下载回读；缺失或不一致时不得发布。真实验收使用隔离的测试 feed 和已安装 updater 基线包完成 N→N+1 检测、下载、通知、优雅退出、替换、重新启动、会话恢复与 Runtime/MCP 恢复，再验证生产 GitHub 通道不暴露 draft 或错误架构资产。

## Risks / Trade-offs

- [“完整对齐”容易无限扩张] → 本 change 以 proposal 列出的 Multica Agents 表面和固定提交为封闭基准；Workspace/任务等明确排除，新增差异必须先更新 OpenSpec。
- [不做 Revision 导致配置更新即时影响执行] → 更新使用 ETag、运行中 Task 保持启动时快照；UI 明示修改影响后续运行，未来版本化另开 change。
- [Account 替代 Workspace 可能导致权限遗漏] → 所有表、缓存键和查询必须携带 `accountId`，跨账号隔离通过仓储、API、MCP、A2A 四层契约测试。
- [成员移除时存在孤儿 Agent/Runtime] → 删除前服务端生成影响计划并要求转移/归档/解绑，事务提交后再撤销凭据。
- [多 Agent 共用一个 Codex Runtime 造成会话串扰] → Edge Runtime session registry 的键至少包含 `agentId + requesterPrincipal + A2A contextId`，并有并发与隔离测试。
- [AI Builder 体量大且依赖真实 Runtime] → Builder 复用同一 Runtime Adapter，草稿与 Agent 创建分离；Builder 失败不得影响已创建 Agent 或其他草稿。
- [Multica 源码研究污染产品] → 固定只读研究提交、第三方来源登记、source-policy fail closed、独立组件命名及源码扫描。
- [视觉相似但行为空心] → 每个 UI task 必须绑定真实 API、失败状态、权限场景和最终真实验收，截图不能替代业务验收。
- [历史 dirty worktree 与新方向交错] → 仅在新 change 中新增规划文件；实施前从当前正确开发分支建立清晰基线，逐文件保留用户现有修改，不用 destructive reset。
- [签名成功被误当成已发布] → 发行门禁必须依次验证最终 `.app`、DMG、公证 ticket、staple、Gatekeeper 和带 quarantine 首次启动，任一步失败都不产生发布结论。
- [自动 Release Notes 把内部提交当成用户价值] → 正文顶部只使用已校验的用户可见条目；GitHub 自动生成的 PR/贡献者列表仅作为补充，且支持 `changelog:skip` 排除。
- [切分 Changelog 后构建失败导致版本悬空] → `prepare` 只生成可审查提交，GitHub Release 先保持 draft；签名、公证、资产和首启均通过后才允许发布。
- [更新资产部分发布导致客户端拿到不可安装版本] → DMG、ZIP、通道元数据和 blockmap 在 draft 中成组上传、回读和校验，只有完整集合通过后才一次性公开 Release。
- [updater 重启与常驻 Runtime/MCP 退出竞争] → 禁用库级自动退出安装，把安装交给现有 Host 生命周期协调器，并用只执行一次的关闭与重新拉起测试覆盖。
- [公开更新源被替换或跨架构误投] → 生产 feed 固定公开 GitHub owner/repository 与 beta channel，校验 SHA-512、Apple 签名、公证、Bundle ID、版本和 arm64 架构；Renderer 不可覆盖 feed。
- [后台更新打断用户工作] → 只自动检查和下载，绝不强制重启；ready 状态持久可见，安装只发生在用户显式重启更新或主动完全退出之后。

## Open Questions

无阻塞项。首期采用单 Account、Google 登录、`owner/admin/member`、唯一真实 Codex Runtime Provider、Account/指定成员调用权限，以及上述四个 MCP 工具；任何扩展必须通过本 change 的后续修订。
