## Context

Agent Fabric 测试服务已经具备 Principal、Credential、Agent Revision、Grant、A2A Gateway 和本机 stdio MCP，但新调用者仍需管理员手工串联这些对象，并把明文 Token 配进 MCP 环境变量。目标用户只知道“我收到一个 Atlas 邀请，希望在自己的 Codex 里问它”，不应理解内部身份或授权字段。

本设计跨越 Control Plane、PostgreSQL/MySQL、CLI 和 MCP 配置，信任边界如下：Google 只证明外部 Human 身份；Owner 的邀请决定 Agent 权限；服务端签发 Agent Fabric Device Credential；本机 CLI 保护设备凭据并调用 Codex 官方 MCP 配置入口；Edge、Runtime Session、ContextCapsule 正文和模型凭据均不参与登录且继续留在 Owner 设备。

## Goals / Non-Goals

**Goals:**

- Owner 生成一个固定 Agent、Revision、能力、期限和额度的一次性邀请。
- 调用者只运行 `agent-fabric join <invite-url>`，完成一次浏览器 Google 登录后即可在同机 Codex 使用 Agent Fabric MCP。
- Google 身份、设备身份、Credential 和 Grant 可独立审计和撤销，任何领取动作都不能扩大邀请权限。
- 登录和交换流程抵抗伪造回调、重放、授权码截获、开放重定向和凭据日志泄漏。
- PostgreSQL/MySQL、自部署与托管测试环境保持同一 API 和迁移语义。

**Non-Goals:**

- 不开放无邀请注册，不实现组织、群组、账号合并、企业 SSO 或多个 OAuth Provider。
- 不把 Google access/id token 返回 CLI、写数据库或用作 A2A/MCP 凭据。
- 不让 Cloud 访问 Edge 私有上下文、Runtime handle、cwd 或模型凭据。
- 不直接编辑 Codex `config.toml`，不覆盖同名 MCP 配置，不要求 Electron App。

## Decisions

### 1. 邀请是 Owner 签发的单次 Capability Envelope

`POST /v1/invitations` 只允许 `grant:manage` Principal 调用。服务端验证调用者拥有目标 Agent，Revision 属于该 Agent，能力是 Revision 能力的子集，期限和额度在服务端上限内。记录只保存随机 Secret 的 SHA-256 摘要，返回一次邀请 URL：`<public-base>/join#token=<secret>`。Fragment 不会随普通 HTTP 请求发送，降低反向代理访问日志泄漏风险；CLI 从 URL 中取出 Secret 后开始入网。

邀请单次消费并固定策略。领取者不能提交 Agent、Revision、能力、期限或额度。撤销、过期、已消费邀请都 fail closed。相比“管理员先创建用户再发 Token”，邀请把五步收敛成一个可撤回对象；相比公开登录后再选 Agent，它保留 Owner Authority。

### 2. 使用服务端 Google OIDC 回调和本机 Loopback 完成无复制粘贴入网

`join` 生成 PKCE verifier/challenge 和随机本机 state，在 `127.0.0.1` 随机端口监听一次回调，然后以邀请 Secret、challenge、loopback return URI 和设备名创建短期 Join Session。服务端返回 Google Authorization URL，CLI 用系统浏览器打开。

Google 只回调固定的 `AGENT_FABRIC_GOOGLE_REDIRECT_URI`。服务端校验 OAuth state、Authorization Code、ID Token 签名、issuer、audience、expiration、nonce 和 `email_verified`，之后生成短期一次性 Exchange Code，并重定向到已登记且严格限制为 `http://127.0.0.1:<ephemeral>/callback` 的地址。CLI 校验本机 state，再用 verifier 交换 Agent Fabric 凭据。

选择服务端回调而非 Google Desktop Client，可复用已创建的 Web Client Secret并保持它只在服务端；选择 loopback + PKCE 而非页面展示 Token，用户无需复制敏感信息，截获 Exchange Code 的进程也无法在没有 verifier 时兑换。

### 3. 外部 Human 身份稳定复用，Device 与 Grant 每次入网独立创建

外部身份键为 `(issuer, subject)`，映射到一个 Human Principal；服务端只保存 Google `sub` 的摘要和显示名，校验 `email_verified` 但不保存邮箱或 Google Token。每次成功 `join` 创建新的 Device Principal，Owner 指向该 Human；Credential 只给 `agent:discover`、`agent:invoke`、`task:read`、`task:cancel`，有效期不超过邀请/服务端上限；Grant 绑定该 Device、固定 Revision 和邀请策略。

现有 Gateway 以认证 Device Principal 作为 requester，因此 Grant 直接授予 Device，而不是共享给 Human 下所有设备。这样单台机器可单独撤权，另一台设备不会继承访问权。

### 4. 邀请消费、身份创建、凭据签发和 Grant 创建必须原子完成

一次性交换在数据库事务和行锁内完成：验证 Join Session、Exchange Code 摘要、PKCE、邀请状态后，查找或创建 Human，创建 Device/Credential/Grant，标记邀请和 Session 已消费，并写 allowlist 审计事件。任一步失败都回滚，不产生“有账号但无授权”或重复 Grant。并发兑换只有一个成功。

数据库新增 `external_identities`、`invitations`、`join_sessions`，以及必要的唯一索引和过期/消费字段。短期记录可由后续清理任务删除；审计只记录对象 ID、结果和错误类别，不记录邮箱、OAuth Code、邀请 Secret、Exchange Code、PKCE verifier 或 Agent 消息。

### 5. OIDC Provider 通过小型端口隔离，生产实现不引入新依赖

服务端定义 `OidcProvider` 端口；测试使用 Fake Provider 覆盖成功、state/nonce/audience/signature/过期失败和重放。Google Adapter 使用 Node 20 内置 `fetch` 与 Web Crypto：向 Google Token Endpoint 换取 ID Token，从 Google JWKS 验证 RS256 签名并校验标准 Claims；JWKS 按响应缓存头有界缓存。

这避免为单一 Provider 引入身份框架和新的供应链依赖。若未来增加 Provider 或企业 SSO，应另立 change 并重新评估采用成熟 OIDC Client 库。

### 6. MCP 通过 Codex 官方 CLI 注册，Agent Fabric Token 只留在私有配置

`join` 将 Server、Device Token、默认 Agent/Revision/Grant 原子写入 `~/.agent-fabric/config.json`（0600），随后调用官方 `codex mcp add agent-fabric -- agent-fabric-mcp --config <path>`。`agent-fabric-mcp` 从该私有配置读取凭据，因此 Codex MCP 配置不包含 Token。

如果 `codex` 不存在、注册失败或已有同名配置，入网身份仍保留，CLI 返回“已加入但 MCP 待配置”和可重试命令；不会覆盖已有 MCP，也不会手写/破坏 `config.toml`。提供 `--no-mcp` 给自动化环境，提供独立 `agent-fabric mcp install` 重试。相比把 Token 写入 MCP env，这减少一个秘密副本并遵循 Codex 的公共配置接口。

### 7. OAuth 是可选服务能力，未配置时 fail closed

新增 `AGENT_FABRIC_GOOGLE_CLIENT_ID`、`AGENT_FABRIC_GOOGLE_CLIENT_SECRET`、`AGENT_FABRIC_GOOGLE_REDIRECT_URI`。三者必须同时存在且 Redirect URI 为公开 HTTPS Origin 下的精确回调路径；否则邀请登录端点返回 `oidc-unavailable`，服务的健康检查、现有 Token 登录、A2A 和 Edge 保持可用。组件 feature flags 只在配置有效时暴露 `google-invite-onboarding`。

## Risks / Trade-offs

- [Google OAuth 处于 Testing，非测试用户无法登录且测试授权有平台限制] → 首轮只加明确测试用户并在验收报告标注；正式开放前完成 consent screen/发布状态评审。
- [邀请链接被转发] → 单次、短期、可撤销，权限预先有界；首次成功兑换后其余请求失败。
- [Loopback 端口被本机恶意进程抢占或拦截] → CLI 先绑定随机端口、使用高熵 state 和 PKCE；拦截者最多造成拒绝服务，不能兑换 Device Token。
- [数据库事务跨 PostgreSQL/MySQL 行为漂移] → 两种 Adapter 运行同一并发兑换、回滚、重放和隐私契约套件。
- [自动 MCP 注册在不同 Codex 版本上失败] → 使用官方 `codex mcp` 命令，失败不回滚有效身份并提供独立可重试操作；不直接改配置文件。
- [本机配置仍含长期 Device Token] → 文件权限 0600、输出和日志统一脱敏；后续可增加 OS Keychain，不在本阶段扩张。

## Migration Plan

1. 添加向后兼容的 PostgreSQL/MySQL migration，先在测试数据库执行并验证旧功能。
2. 部署包含新表但尚未配置 Google 环境变量的 Server，确认现有 A2A/Edge 无回归。
3. 注入 Google Client ID/Secret/Redirect URI，重启后验证 feature flag 与回调地址。
4. 管理员为测试 Atlas 创建一次性 `ask` 邀请；使用第二个 Google 测试身份和隔离的临时 HOME 运行完整 `join`、Codex MCP discovery/ask、重放拒绝和撤权验收。
5. 失败时移除三项 Google 配置即可关闭新入口；新表保留，不回滚已签发 Device/Grant，管理员可显式撤销。

## Open Questions

- 正式对外前是否将 Google OAuth App 从 Testing 发布到 Production；不阻塞测试环境实现。
- Device Token 后续是否迁移到 macOS Keychain/跨平台 Secret Store；首版沿用已有 0600 配置契约。
