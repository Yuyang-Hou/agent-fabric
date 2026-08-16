## Why

Google 邀请登录已经把“询问别人的 Agent”收敛为自助流程，但同一位用户若要发布自己的 Agent，仍需管理员手工签发 Owner 和 Edge Token。产品需要让已验证的 Google 用户在不接触 Token、不获得全局管理权限的前提下，自助创建、发布并运行仅属于自己的 Agent。

## What Changes

- 增加无邀请 Google 登录：首次登录创建或复用 Human Principal，并签发仅能管理其自有 Agent 的本机 Owner Device Credential。
- 将发布授权从全局 Scope 收紧为“有相应 Scope 且拥有目标 Agent”；用户不能管理其他 Owner 的 Agent、Revision、Grant 或邀请。
- 增加一条自助发布路径：CLI 完成 Google 登录、MCP 配置、Agent/Revision 发布、Agent 专属 Edge Credential 签发与本机 Edge 启动。
- Edge Credential 绑定单一 Agent 和发布者设备，Edge 握手不能切换到其他 Agent。
- Google 身份只用于认证 Human；Owner、MCP 和 Edge 使用独立、可撤销、最小权限的设备凭据，均由 CLI 隐藏管理。
- 保留现有邀请领取、Bootstrap 管理员、显式 ContextCapsule 披露确认和 headless 高级命令。
- 明确非目标：不开放组织管理、团队角色、企业 SSO、Cloud 模型托管、非 macOS Edge 自动安装或自动读取任意 Codex 原会话。

## Capabilities

### New Capabilities

- `self-service-agent-publishing`: Google 用户的无邀请登录、自有 Agent 授权、一条路径发布、Agent 绑定 Edge 凭据和本机自动配置。

### Modified Capabilities

- `invite-onboarding`: 已存在的 Google Human 身份可同时拥有独立的 Owner Device 和受邀请约束的 requester Device，且两类权限不得相互继承。

## Impact

- A2A：协议不变；现有 Gateway 继续按 requester Credential 与 Grant 校验。
- Control Plane：新增自助登录/交换与 Agent 专属 Edge 凭据签发接口，并加强 Agent 所有权校验。
- Edge Host：连接时验证 Credential 与 Agent 绑定；Runtime 私有数据继续只留在 Edge。
- CLI / Codex：新增 Google `login` 与面向普通用户的 `publish` 编排，自动维护私有凭据、MCP 和 macOS Edge。
- 数据库：为凭据增加可选资源约束，并复用外部身份映射；迁移保持 PostgreSQL/MySQL 一致。
- 产品 UI：本 change 不增加 Electron 前置流程；浏览器只承担 Google 登录结果页。
