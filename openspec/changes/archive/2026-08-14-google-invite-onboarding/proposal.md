## Why

当前远端调用者必须由管理员手工创建 Principal、Credential 和 Grant，再自行配置 CLI/MCP；这让“让别人从自己的 Codex 调用 Atlas”需要理解内部身份模型。现在测试服务已经可用，最小的下一步是把这组操作收敛为一次邀请和一次 Google 登录。

## What Changes

- Owner 用 CLI 创建一次性邀请；邀请固定 Agent、Revision、允许能力、有效期和调用额度，不能由领取者扩大。
- 调用者运行一个 `agent-fabric join <invite-url>` 命令，浏览器完成 Google OIDC 登录后，CLI 自动取得独立设备凭据并配置 Agent Fabric MCP。
- 服务端把 Google `sub` 映射到 Human Principal，每次新设备创建独立 Device Principal、Credential 和受邀请约束的 Grant。
- 登录采用 Authorization Code、state、nonce 和 PKCE；邀请、授权码、设备令牌仅保存摘要或仅展示一次，失败默认拒绝。
- 增加邀请创建、登录开始/回调、一次性交换、撤销和审计接口，以及可移植的关系型数据库迁移。
- 测试环境接入已创建的 Google OAuth Web Client；客户端密钥仅通过服务端环境变量注入。
- 明确非目标：不增加 Electron 前置流程，不把 Google Token 当作 Agent Fabric 凭据，不开放公开注册，不实现企业 SSO、账号合并、组织/群组管理或任意第三方 OAuth Provider。

## Capabilities

### New Capabilities

- `invite-onboarding`: Owner 约束邀请、Google OIDC 身份映射、设备入网、一次性凭据交换、CLI/MCP 自动配置、撤销和审计。

### Modified Capabilities

无。主规格目录尚无已归档 capability；本 change 在现有 headless MVP 实现上增加独立、可验收的用户接入能力。

## Impact

- A2A：协议和任务数据面不变；新 Grant 仍由现有 Gateway 校验。
- Control Plane：新增邀请、外部身份、登录事务和一次性交换 API/持久化；不保存 Google access token、原始 Prompt 或 Runtime 私有上下文。
- CLI / MCP：新增 `invite`、`join` 和本机凭据/MCP 配置流程；Electron UI 不参与。
- Edge Host / Runtime Adapter：无协议变化，继续按既有 Revision 和 Grant 执行。
- 部署：新增 Google OAuth 配置和公开回调 URL；PostgreSQL/MySQL 迁移保持一致，未配置 OAuth 时相关端点明确返回 unavailable，服务其余能力保持可用。
