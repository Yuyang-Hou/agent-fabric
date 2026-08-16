## Context

个人 Railway 部署已经支持 Google Owner 登录、自助发布、一次性邀请、Requester join、A2A ask 和撤权，但真实回归通常需要第二个人配合。现有 CLI 的 `join` 会持久化 Requester 配置并安装 MCP，因此直接用当前账号测试可能覆盖 Owner 配置或改变 ChatGPT Desktop 环境。

信任边界保持不变：Google 只验证 Human；Control Plane 生成独立 Device Credential 和 Grant；A2A 请求使用 Requester Device；运行时凭据、工作区和私有上下文继续只存在于 Edge。自测编排位于 CLI，不引入私有 A2A 字段，也不读取服务端数据库。

## Goals / Non-Goals

**Goals:**

- 用一次命令验证线上 Agent 的 Presence、Invitation、Google join、Discovery、A2A ask、Grant revocation 与拒绝路径。
- 同一 Google subject 可复用 Human，但 Requester Device、Credential 和 Grant 与 Owner authority 隔离。
- 自测 Requester Credential 仅驻留进程内，退出后不可由 CLI、MCP、Skills 或 Edge 继续使用。
- 所有退出路径尽力撤销 Invitation 和 Grant，输出只包含允许公开的对象 ID、阶段、耗时和回答长度。
- 通过依赖注入与 Fake Client 自动化验证顺序、隔离、失败清理和脱敏。

**Non-Goals:**

- 不自动点击 Google 登录、账号选择、验证码或 OAuth 同意页面。
- 不证明两个不同 Google Human 的身份隔离；该边界保留为发布前低频验收。
- 不发布新 Revision、不启动第二个 Edge、不替换当前 LaunchAgent。
- 不改变 Control Plane、A2A、Edge Host、Runtime Adapter 或数据库 Schema。

## Decisions

### 1. 复用已在线的 Owner Agent

`self-test` 从当前 Owner 配置取得 Agent/Revision，先查询 Presence，再创建短期、两次额度的 ask-only Invitation。这样覆盖真实公网和本机 Runtime，同时避免每次创建 Revision、切换 Edge 部署或遗留测试 Agent。

备选方案是每次发布临时 Agent，但当前 macOS LaunchAgent label 是单实例，临时发布会干扰真实 Agent，故不采用。

### 2. Requester Credential 仅在内存中传递

join exchange 的结果直接构造临时 `AgentFabricClient`，不调用 `writeConfigAtomic`、`installMcp` 或 `installEdgeService`。OAuth callback 所需 verifier、state、code 和 Device Token 只存在于当前进程闭包中。

备选方案是设置临时 `AGENT_FABRIC_HOME`/`CODEX_HOME` 后复用子命令；虽然可隔离文件，但会留下临时凭据并增加子进程、清理和路径判断，内存编排更小且更安全。

### 3. 验收结果使用结构化阶段，不输出内容

成功必须同时满足：部署在线、join 成功、目标投影可发现且在线、首次 A2A 返回非空 Agent Artifact、Owner 撤销 Grant 后目标不再可发现且再次 A2A 调用失败。报告记录阶段状态、耗时和回答字符数，不记录 Invitation URL、Token、OAuth Code、邮箱、Prompt 或回答正文。

### 4. 清理是命令正确性的一部分

命令持有 Invitation ID 后，无论主流程是否成功都在 `finally` 中撤销尚未撤销的 Grant 和 Invitation。清理失败会令命令以稳定错误结束，而不是报告通过。数据库中已产生的 Device、Credential、Task 和审计记录按安全审计保留；Credential 受短期有效期限制且 Grant 已撤销。

### 5. 人工边界只保留 Google OAuth

命令仍要求显式 `--confirm` 才能创建外部资源和发起真实 Agent 调用；之后自动打开现有 OAuth URL并等待 loopback callback。Google 账号选择、同意、验证码等由用户完成，CLI 不做页面自动化。

## Risks / Trade-offs

- [用户在 OAuth 中选了另一账号] → 仍可验证完整邀请链路，但报告不声称复用了同一 Human；终端提示用户选择当前 Owner Google 账号。
- [Agent 人设不按固定口令回复] → 不比较固定文本，只验证 completed 结果中存在非空 Agent Artifact。
- [撤权后的 A2A 失败缺少稳定细粒度错误] → 同时验证 Discover 投影消失和 A2A 请求失败，避免只依赖 SDK 错误文本。
- [进程在 finally 前被强制终止] → Invitation 有短期过期时间、Grant 有低额度和短期有效期；Owner 可从审计/管理入口补充撤销。正常错误、取消和超时均执行清理。
- [自测调用产生真实模型成本] → 默认只执行一次最短提示，第二次请求在 Grant authorization 阶段被拒绝，不到达 Edge Runtime。

## Migration Plan

仅新增 CLI 命令，无数据迁移。部署新版客户端包后即可使用；回滚到上一版本只会移除该命令，不影响既有 Agent、Invitation 或凭据协议。

## Open Questions

无。若后续需要零人工定时回归，应另行设计测试专用 OIDC 身份或受限服务身份，不能复用生产 Google OAuth Code。
