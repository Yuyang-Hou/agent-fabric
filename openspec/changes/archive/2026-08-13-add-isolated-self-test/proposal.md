## Why

真实邀请链路目前依赖另一位用户安装客户端并配合验收，导致回归成本高且难以持续。产品需要让 Owner 使用同一个 Google 账号，以隔离的 Requester Device 权限完成线上邀请、发现、询问与撤权闭环，同时保证不污染日常 CLI、MCP、Skills 或 Edge 环境。

## What Changes

- 新增 `agent-fabric self-test`，对当前已发布且在线的 Owner Agent 执行一次真实 Control Plane、Google OAuth、A2A 与 Edge Runtime 闭环。
- 自测创建短期、低额度的一次性邀请，并以同一或另一 Google Human 登录为独立 Requester Device。
- Requester 凭据只保存在进程内；命令不得改写用户 CLI 配置、Codex MCP、Skills、LaunchAgent 或当前 Edge。
- 验证 Agent 可发现、可返回非空答案，并在 Owner 撤销 Grant 后验证后续调用被拒绝。
- 无论成功、失败或用户取消，尽力撤销已创建的邀请或 Grant，并输出不包含 Secret、Token、OAuth Code、邮箱和原始回答的分阶段结果。
- 非目标：不自动操作 Google 登录/同意页面，不创建第二个 Edge，不测试两个不同 Google Human 的身份隔离，不更改 A2A、Control Plane 或 Runtime Adapter 协议。

## Capabilities

### New Capabilities

- `isolated-self-test`: 覆盖个人部署的同账号双角色、内存凭据隔离、真实调用、撤权验证与安全清理。

### Modified Capabilities

无。

## Impact

- CLI：新增 `self-test` 命令及可测试的 OAuth/客户端编排逻辑。
- Control Plane：仅调用既有邀请、Google join、Agent discovery、A2A ask、Grant revoke API；无 API 变更。
- Edge Host / Runtime Adapter：通过既有线上 Agent 执行真实请求；无协议或持久化变更。
- 产品 UI：仅打开现有 Google OAuth 页面；人工确认边界不变。
- 数据与安全：产生短期 Invitation、Requester Device/Credential、Grant、Task 和审计记录；凭据不落盘，Grant 最终撤销。
