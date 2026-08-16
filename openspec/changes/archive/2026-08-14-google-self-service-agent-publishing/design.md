## Context

当前 Control Plane 已支持 Google 邀请入网：Google `(issuer, subject)` 映射 Human，每次邀请兑换创建 requester Device、最小权限 Credential 和固定 Revision Grant。发布侧仍依赖 Bootstrap 管理员 Token和另一枚手工 Edge Token；CLI 的 `publish`、`edge install`、`invite` 是分离的高级命令。

本设计跨越 Control Plane、关系型持久化、CLI、MCP 和 Edge。Google 只证明 Human 身份；Cloud 只保存公开 Revision、授权元数据和凭据摘要；ContextCapsule 正文、工作目录、Runtime Session、模型凭据及私有 Skills/MCP 配置继续留在发布者设备。A2A 数据面不增加私有字段。

## Goals / Non-Goals

**Goals:**

- Google 用户无需邀请或管理员 Token 即可登录，并且只能管理自己创建的 Agent。
- 普通用户通过一次发布命令完成登录检查、Agent/Revision 发布、MCP 配置、Edge 凭据签发和本机 Edge 启动。
- Human、Owner Device、requester Device 与 Edge Device 权限独立、可撤销、可审计。
- Edge Credential 与单一 Agent 绑定，泄漏后不能被改用于连接其他 Agent。
- 保留 ContextCapsule 的显式披露确认和本地优先边界。

**Non-Goals:**

- 不让 Google 身份自动获得 `server:admin` 或管理他人 Agent 的权限。
- 不把原始 Codex 对话自动上传到 Cloud，不改变 ContextCapsule 大小和敏感字段约束。
- 不实现组织、团队成员角色、企业 SSO、账号合并或非 Google Provider。
- 不在 Cloud 托管 Codex、模型密钥或 Owner Runtime。
- 不承诺 macOS 以外的自动 Edge 后台服务；其他平台继续使用显式 headless 命令。

## Decisions

### 1. 无邀请登录复用 OIDC、Loopback 与 PKCE，但使用独立事务类型

CLI `login` 与现有 `join` 使用同一浏览器、固定 Google 回调、loopback state 和 PKCE 安全机制。服务端新增 self-service login session，而不是伪造一个“平台拥有的无限邀请”。成功兑换时创建或复用 Human，并创建 Owner Device Credential，Scopes 固定为 `agent:publish`、`agent:discover`、`grant:manage`、`task:read`、`task:cancel`；不包含 `server:admin`、`edge:connect` 或对他人 Agent 的调用授权。

独立事务类型让邀请的 Agent/Revision/额度约束保持原义，也便于分别限流、撤销和审计。Google Token、邮箱、PKCE verifier 和交换码仍不进入普通日志或数据库明文字段。

### 2. Scope 只表示操作类别，资源所有权由 Store 强制校验

拥有 `agent:publish` 或 `grant:manage` 不能单独授权跨租户操作。Agent 注册时 Owner 绑定到已认证 Human；后续 Revision 发布、Grant/Invitation 创建及 Edge Credential 签发都必须在 Store 中验证目标 Agent 的 `ownerPrincipalId` 与当前设备的 `ownerPrincipalId` 一致。

Owner Device Principal 的 `ownerPrincipalId` 指向 Human；管理员 Human 直接持有的旧 Credential 继续兼容。选择服务端资源校验而不是把 Agent ID 编码到通用 Scope，是为了保留现有 Scope 枚举和 API，同时把不可绕过的所有权规则放在持久化事务边界。

### 3. 自助发布由 CLI 编排现有原子能力，不新增 Cloud Runtime

面向用户的 `publish` 接受有界 ContextCapsule、显示名、workspace 和显式披露确认。若本机未登录则先完成 Google 登录；随后创建或复用自有 Agent、注册新 Revision、为该 Agent 签发 Edge Device Credential、保存 Edge 私有配置、安装/重启 macOS LaunchAgent，并确保 MCP 已配置。

每一步可重试且服务端对象使用稳定幂等键或本机记录恢复。失败时 CLI 返回结构化阶段与下一条恢复动作：Revision 已发布但 Edge 启动失败时不会声称 Agent 可用，也不会删除已发布 Revision。高级用户仍可分步执行原有命令。

### 4. Owner、MCP 与 Edge 使用独立设备凭据

Google 登录兑换得到 Owner Device Credential，只用于 Control Plane 发布和授权管理。本机 MCP 使用独立 requester Device Credential；发布自己的 Agent 后，CLI 为 Owner 自己创建固定 Revision 的 requester Grant，使其也能从 Codex 询问自己的 Agent。Edge 使用独立 `edge:connect` Credential，并绑定 `agentId`。

三枚凭据由系统自动签发、存入 0600 私有配置且分别可撤销。CLI 状态与日志只显示设备名、过期时间和对象 ID，不显示 Token。相比复用一枚全能 Token，此方案降低 MCP 或 Edge 进程泄漏后的影响范围。

### 5. Edge 绑定在认证结果中验证

Credential 记录增加可选 `resourceType/resourceId` 约束。Edge WebSocket 升级认证 `edge:connect` 后，服务端比较绑定的 `agentId` 与握手头；不匹配直接关闭且不登记 Deployment。现有未绑定的 Bootstrap 管理员 Edge Credential仅为迁移兼容保留，新的自助接口只能签发绑定 Credential。

### 6. 同一个 Google Human 可拥有多种互不继承的 Device

外部身份仍按 `(issuer, subjectDigest)` 唯一复用 Human。`join` 创建 requester Device；`login` 创建 Owner Device；发布编排创建 MCP requester Device 与 Edge Device。权限只落在各 Device Credential 和显式 Grant 上，Human 复用不导致 Device 间 Scope 或 Grant 继承。

## Risks / Trade-offs

- [公开 Google 登录可能被滥用创建大量 Agent] → 服务端按 Human、IP 和时间窗限制登录、Agent、Revision 与凭据创建；首个测试版本提供可配置 allowlist/总量上限并默认拒绝超额。
- [Owner Scope 被误当成全局管理权限] → 所有写路径增加 Store 级 Owner 校验和跨 Owner 合同测试；`server:admin` 保持独立。
- [多阶段发布产生部分成功] → CLI 持久化阶段性对象并幂等恢复，以“Edge online”为最终成功条件，输出不夸大状态。
- [自动启动 Edge 仅支持 macOS] → macOS 自动安装；其他平台明确返回 `edge-install-manual-required` 和 headless 命令，不假装完成。
- [本机仍保存多枚长期凭据] → 文件 0600、独立撤销、日志脱敏；OS Keychain 留作后续变更。
- [Google OAuth App 仍处 Testing] → 测试环境维持测试用户 allowlist；正式开放前完成 Google consent 发布审核。

## Migration Plan

1. 先部署向后兼容的数据表/列与所有权校验；现有 Bootstrap、邀请和 A2A 路径保持可用。
2. 部署 self-service OIDC API，但以服务端 feature flag/allowlist 关闭公开入口。
3. 发布新 CLI 包，在隔离 HOME 中验证新 Google 用户 login → publish → Edge online → invite → 第二用户 join → ask。
4. 对既有 Gmail 验收身份确认 Human 复用、Device 隔离和无权限继承。
5. 测试通过后打开测试环境入口；回滚时关闭 self-service flag，已创建的 Agent/凭据保留且可由管理员撤销。

## Open Questions

- 正式公测前采用 Google Workspace 域 allowlist 还是 Google OAuth Production 公共注册；测试实现采用可配置 allowlist。
- 非 macOS Edge 服务的安装器和系统服务机制另立 change，不阻塞当前 macOS 产品闭环。
