## Context

Agent Fabric 已建立 A2A、Control Plane、Edge Host 和 Runtime Adapter 的边界，也在 Messenger MVP 中验证了从 Codex 对话生成上下文快照的方向。但当前产品路径仍依赖 Electron App 内的发布确认和聊天界面，且 `apps/control-plane` 尚未形成可安装、可运维、可迁移的服务端。

本 change 面向两类用户：发布自己本机 Agent 的 Owner，以及在自己的 Codex 中调用他人 Agent 的 Requester。两者都应只需安装 Agent Fabric Codex Plugin/CLI；Owner 机器额外运行 Edge 守护进程。团队管理员或个人部署者应能在新机器上用容器和少量配置启动服务端，并可完整备份、恢复和升级。

信任边界如下：Codex Plugin 和 CLI 运行在用户设备；Edge Host 持有私有 AgentSpec、ContextCapsule、Runtime 会话映射和模型侧凭证；Control Plane/Gateway 只持有身份、公开 Agent Card、Grant、Presence、Task 路由与有限审计元数据；Runtime Adapter 只在 Edge 内部存在。A2A v1.0.1 HTTP+JSON/REST 是唯一外部 Agent 数据面。

## Goals / Non-Goals

**Goals:**

- 用户在原本的 Codex 对话中完成发布、发现、提问、委派、追问和查看结果。
- 发布者无需保持 Electron App 打开；Edge 守护进程可独立运行并只建立出站连接。
- 将当前可见上下文发布为不可变、可审计的 ContextCapsule Revision，不依赖原 Codex thread 是否可恢复。
- 同一 Agent 对不同调用者、不同 A2A Context 使用隔离 Runtime Session，同时保留同一调用者 Context 内的连续追问。
- 服务端以独立 OCI 镜像和 Docker Compose 交付，支持自动初始化、升级、备份恢复、迁移、健康检查和版本兼容诊断。
- 保持未来拆分独立服务端仓库、替换 Runtime、增加 App UI 或部署到 Kubernetes 的可能性。

**Non-Goals:**

- 不接管或复制原 Codex thread，不承诺隐藏推理或完整历史的精确继承。
- 不让 Skill、MCP、A2A Task 或 Agent 自身创建外部 Grant。
- 不让 Cloud 运行 Owner Runtime、持有模型凭证或默认长期保存正文与 Artifact 内容。
- 不在本阶段提供 Matrix 聊天、Electron 必需流程、群聊、公开市场、计费、企业 SSO、P2P 或离线云端代答。
- 不默认授予写文件、任意网络、部署、付款等副作用能力。

## Decisions

### 1. 产品入口采用 Codex Plugin，CLI 是稳定控制面

发布为一个可安装 Codex Plugin：Skill 负责把自然语言意图转换为可理解的流程，MCP Server 提供 `find_agent`、`ask_agent`、`delegate_task` 和 `get_task` 等受控工具；CLI 提供 `setup`、`login`、`edge start/status`、`publish`、`grant`、`revoke`、`doctor`、`backup` 和 `restore` 等确定性操作。所有 CLI 命令提供稳定 JSON 模式，MCP 复用同一 Client SDK 和领域错误，不复制协议实现。

Agent Fabric CLI 不依赖独立安装的 Codex CLI。ChatGPT Desktop、Codex CLI 与 IDE Extension 共享 Codex Host 的 `~/.codex/config.toml`；安装器直接、原子地 upsert 自己的 `[mcp_servers.agent-fabric]` 配置并独立安装 Skills。STDIO 启动配置把执行安装器的 Node 绝对路径作为 `command`，把 Agent Fabric MCP 入口绝对路径和业务参数放入 `args`，不得依赖 ChatGPT Desktop 继承终端、NVM 或 shell 的 `PATH`。Node 安装路径变化后，用户重跑 `agent-fabric mcp install` 即可刷新绑定。写入前必须完整解析现有 TOML，写入时保留所有无关配置、使用受限文件权限和原子替换；配置无效或无法安全合并时 fail closed，不留下部分激活的 MCP/Skill 状态。`codex mcp` 仅可作为可选诊断手段，不得成为安装或卸载前置条件。

发布 Skill 将当前 turn 实际可见的上下文压缩为 ContextCapsule，并通过本机 CLI/Edge 创建 Owner-only Revision。对外分享是独立的 `grant` 命令，需要交互式人类确认；非交互环境必须提供预先签发、范围受限的管理凭据，普通 MCP 进程拿不到该能力。

选择原因：用户无需学习新聊天 App；Skill 适合表达工作流，MCP 适合受控远端调用，CLI 适合安装、授权、诊断和自动化。备选方案是只做 MCP，但它无法清晰承载守护进程、人工授权和灾备运维；只做 CLI 又会降低 Codex 内自然问答体验。

### 2. ContextCapsule Revision 是发布来源，原 thread 不再是运行时依赖

ContextCapsule 使用版本化 Schema，包含目标、已确认事实、约束、决策、未完成事项、允许公开的文件引用、来源说明、覆盖等级和内容摘要哈希。它不包含隐藏推理、凭证、原 Runtime/thread ID、绝对路径或未选择的完整历史。Edge 校验大小与敏感字段后创建不可变 Revision；更新产生新 Revision，已运行任务继续引用原 Revision。

选择原因：原 Codex 会话可能正被其他进程持有、已压缩或不可恢复。快照语义牺牲完全保真度，换取稳定、可理解且低心智成本的发布流程。备选方案是恢复原 thread，已被实际运行时租约和可恢复性问题否决。

### 3. 每个调用方与 A2A Context 使用隔离的派生 Session

Edge 私下维护 `(agentRevisionId, requesterPrincipalId, a2aContextId) -> runtimeSessionHandle`。首次调用创建由 ContextCapsule 初始化的新 Session；同一三元组的连续追问可恢复；任何调用方、Context 或 Revision 变化都创建新 Session。Runtime handle、cwd 和 Session 映射永不发送到 Control Plane。

选择原因：共享一个“Atlas 原会话”会让不同用户相互污染上下文并泄漏信息。备选方案是每次请求全新 Session，隔离更简单但无法自然追问；因此采用按调用方 Context 隔离。

### 4. Edge 是常驻的出站连接客户端

Edge 作为用户级无界面守护进程运行，使用设备密钥向 Gateway 建立认证 WebSocket 长连接；协议 envelope 承载标准 A2A 对象、幂等键和路由元数据，不增加私有 A2A 字段。连接断开时指数退避重连；Gateway 将 Agent 标记为离线，不伪造 working/completed。首版仅在线执行，不在 Cloud 保存待执行正文。

本机 Owner 调用可直接走 loopback Edge；远端调用经 Gateway 转发。Edge 使用 durable inbox、任务取消墓碑和幂等键保证一个 Task 至多开始一次。

选择原因：不要求家庭或办公网络开放入站端口，也能在 Codex Desktop 关闭后继续服务。备选 P2P/WebRTC 增加连通性和密钥复杂度，留待后续。

### 5. 授权属于私有 Control Plane，并坚持人类权限边界

Control Plane 管理 Human/Device/Agent Principal、Deployment、Grant 和 Presence。Grant 绑定调用者、Agent、Revision/能力范围、有效期和预算；Gateway 在接收与转发前检查，Edge 在执行前再次检查。撤权生成单调递增的授权版本并主动通知 Edge，阻断新任务并请求取消仍在运行的任务。

Owner-only 发布不产生外部访问权。外部 Grant 只能由具有本机人类管理凭据的交互式 CLI 创建；Agent 工具凭据只允许调用与读取自身任务。

选择原因：把确认从 Electron UI 移到 CLI 后仍需保持 Human Authority。备选方案是 MCP 弹出确认或允许 Agent 自授权，会产生提示注入和权限提升风险，因此拒绝。

### 6. Gateway 只实现标准 A2A 数据面，产品治理 API 独立

Gateway 固定 A2A v1.0.1 HTTP+JSON/REST 的 Agent Card、Send Message、Get/List/Cancel Task；TaskState 与 Artifact Parts 直接使用标准 Schema。身份注册、登录、设备、Agent 发布、Grant、Presence 和运维位于版本化 Control Plane API，不向 A2A 对象添加私有顶层字段。

服务端默认只保存 Task ID、Context ID 的不可逆索引、状态、时间、路由目标、错误类别和用量摘要；请求正文和 Artifact 只在转发期间存在于内存，不写数据库或普通日志。未来如果提供离线密文队列，必须另立设计和密钥方案。

### 7. 服务端以单一发行物、模块化内部边界和可替换关系型存储交付

首版在当前 monorepo 实现，但产出独立 `agent-fabric-server` OCI 镜像。镜像内可用单进程承载 Control Plane API、A2A Gateway、Edge Tunnel 和迁移入口，代码仍按 identity、registry、grant、routing、task 和 persistence 模块隔离。服务使用统一 Repository 契约：Compose 与通用自部署默认使用固定大版本 PostgreSQL；托管平台只提供 MySQL 时可通过独立 MySQL Adapter 使用同一领域模型、Schema 版本和 API。数据库方言只存在于 persistence package 内，不泄漏到 Control Plane、A2A 或 Edge。

仓库提供版本固定的 `compose.yaml`、`.env.example`、初始化命令和可选 Caddy TLS profile。默认本机 profile 仅绑定 loopback；公网 profile 必须配置公开基址、TLS 和强随机密钥后才启动。运行时通过显式 `AGENT_FABRIC_DATABASE_DRIVER=postgres|mysql` 选择后端，禁止根据连接串静默猜测或自动降级。MySQL 驱动接受标准 `mysql://` URI，也可把托管平台 DBKey 常见的 `jdbc:mysql://` 写库地址在内存中规范化为相同连接契约；规范化不得记录源连接值，并丢弃 Java 连接池专属参数。所有平台专属部署模板都位于 OCI/配置契约之外。

选择原因：一个镜像、一个显式数据库驱动最容易被个人或小团队自部署，也能落在只提供 MySQL 的现有托管平台上；PostgreSQL 仍是文档和 Compose 的默认路径，避免让普通用户选择数据库。备选方案是首版微服务/Kubernetes，运维成本明显高于收益；SQLite 对单机简单，但会制造与团队部署、备份和并发不同的第二套生产路径，因此不采用。

### 8. 初始化、升级和兼容失败均显式且可恢复

首次启动通过一次性 bootstrap token 创建首个管理员和实例身份；token 消费后失效，日志不得输出明文。数据库迁移在启动前以独立 job 执行并加互斥锁；服务只在 Schema 兼容后进入 ready。破坏性升级必须先生成可恢复备份，并提供受支持的逐版本升级路径。

CLI、Edge 和 Server 在握手时交换语义版本、A2A 版本、Runtime Adapter 版本和 feature flags。大版本不兼容时拒绝连接并给出升级方向；小版本能力缺失时只禁用相应功能。旧 Edge 不能让服务端降级授权或隐私策略。

选择原因：自动“尽量运行”会把迁移错误转成数据损坏或安全降级。显式 fail closed 虽增加一步升级操作，但更适合可迁移、自托管产品。

### 9. 备份是可验证的产品命令，不是文档片段

`agent-fabric server backup` 生成带 manifest、Schema 版本、Server 版本、校验和的加密可选归档，包含 PostgreSQL 逻辑备份和非秘密实例配置；设备私钥、登录令牌、ContextCapsule 和模型凭证不在服务端，因此不进入备份。`restore` 只接受校验通过且版本可迁移的归档，默认要求空实例；完成后运行一致性检查并使 Edge 重新认证连接。

同时提供 `export`/`import` 用于可审计的身份、Agent Card 与 Grant 元数据迁移。备份和恢复应能在 Compose 与外部 PostgreSQL 两种模式运行。

选择原因：换机器是明确用户目标，必须被自动化验收。仅提供 `pg_dump` 文档容易漏配置和版本元数据；卷目录复制跨平台不可靠，因此拒绝作为正式方案。

### 10. Electron/Matrix 成为可选客户端而非废弃资产

现有 Messenger change 暂停作为默认实现任务清单。其 UI、Matrix E2EE 和联系人房间能力不进入本阶段依赖，也不删除。未来 App 必须调用相同 Control Plane Client、MCP/A2A Client 和 Human Authority 命令，不得重新创建第二套发布或任务协议。

## Target Modules

```text
apps/server                         independently packaged Control Plane + A2A Gateway
apps/edge-host                      headless daemon, tunnel, policy and session manager
apps/cli                            human control and operational commands
packages/client                     shared typed client and domain errors
packages/codex-plugin               plugin manifest and Skill/MCP configuration
packages/mcp-server                 Codex-facing Agent discovery and task tools
packages/context-capsule            capsule schema, validation and redaction
packages/persistence-postgres       repositories, migrations and backup metadata
packages/persistence-mysql          optional managed-platform repository adapter
packages/a2a                        pinned A2A types, conformance and HTTP boundary
adapters/runtime-codex-acp          first real Runtime Adapter behind contract
deploy/compose                      compose, env example and optional Caddy profile
```

## Risks / Trade-offs

- [上下文快照可能遗漏重要信息] → 显示覆盖等级、摘要和来源；支持发布新 Revision，不宣称恢复原会话。
- [常驻 Edge 增加本机运维成本] → CLI 提供 install/start/status/logs/doctor，系统服务自动启动并给出明确离线原因。
- [WebSocket 中转可瞬时看到正文] → TLS、内存转发、正文日志禁用、最小元数据；消息级 E2EE 另立 change，不虚假宣称当前已实现。
- [不同调用者仍可能通过 Agent 输出推断共享快照] → Owner 在 Grant 前看到披露范围；每个调用方 Session 隔离，策略阻止访问未授权本机资源。
- [Compose 自动迁移导致升级不可回退] → 启动前备份、迁移锁、兼容矩阵和显式 rollback 文档；破坏性迁移不得静默执行。
- [单进程服务端形成内部耦合] → 包依赖规则、Repository 接口和模块契约测试保证边界，部署拓扑不决定领域边界。
- [自部署公网配置错误] → 默认 loopback、TLS profile、安全启动校验、短期 bootstrap token 和 `doctor` 检查；不安全配置 fail closed。
- [CLI 交互确认影响自动化] → 管理自动化使用显式、范围受限的 admin token；普通 Agent/MCP 凭据永不继承授权能力。
- [直接更新 Codex Host 配置可能破坏用户的其他 MCP 设置] → 使用 TOML 解析与确定性序列化，只替换 Agent Fabric 自有表；写入前验证、使用原子文件替换和受限权限，失败时保持原文件与 Skills 不变。
- [ChatGPT Desktop 与终端的 PATH 不同，无法解析 NVM 中的 Node] → MCP `command` 固定为安装时 `process.execPath` 的绝对路径，入口脚本作为首个参数；Node 路径变化时通过幂等安装命令刷新。

## Migration Plan

1. 将本 change 评审为新的产品 MVP；`trusted-agent-messenger-mvp` 保留证据但暂停后续实现，不归档也不删除。
2. 先实现 ContextCapsule、CLI/Client SDK、Fake Runtime 与隔离 Session 契约测试，保持现有模块可运行。
3. 实现 PostgreSQL Repository、Server/A2A Gateway、Edge Tunnel 与本机双身份纵切。
4. 产出 OCI 镜像和 Compose，完成 PostgreSQL 空白安装、托管 MySQL 部署、重启、升级、备份、换机恢复和旧版本拒绝测试。
5. 打包 Codex Plugin，在未安装独立 Codex CLI、仅安装 ChatGPT Desktop 的 Requester 机器上完成 MCP/Skill 配置，并在两台独立机器/用户上完成“发布—授权—对方 Codex 提问—连续追问—撤权”验收。
6. 验收通过后再决定是否拆分独立服务端仓库；若拆分，镜像名、配置项、数据库 Schema 和 API 兼容契约保持不变。
7. 任一阶段可停止新 Server/Edge 并恢复升级前备份；不会要求迁移或删除 Electron/Matrix 数据。

## Open Questions

- 首个公开安装包使用 npm 分发 CLI/Plugin，还是同时提供 Homebrew；不影响协议与服务端实现，实施前确认发行渠道即可。
- 外部用户身份首版采用管理员邀请码、邮箱验证码还是 OIDC；自部署基线先实现 bootstrap admin + 邀请/设备令牌，OIDC 留作扩展。
- 服务端公网 Alpha 使用内置 Caddy profile 还是现有反向代理；两种模式都必须通过同一公开基址与 TLS 校验。
