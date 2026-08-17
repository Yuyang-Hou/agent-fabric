# Agent Fabric

本地多 Agent 创建、管理与好友互联产品。每个用户拥有自己的个人 Account、Runtimes 和多个 Agents；好友可在 Desktop 与 Codex MCP 中发现对方明确开放的 Agent，并以标准 A2A 完成问答。

## 当前阶段

当前唯一目标是在成熟多 Agent 管理能力上建立清晰的个人 Account 与 Human 好友模型：邀请不含角色，接受后不加入对方 Account；Owner 可逐个设置 Agent 为“仅自己”或“好友可访问”。好友开放的 Agent 会显示在对方 App 的 Agent 管理与 Codex MCP 中，但只展示安全摘要且不可管理。产品没有 Account 切换、Workspace、项目、任务板或 App 聊天。

- 架构权威：[ARCHITECTURE.md](./ARCHITECTURE.md)
- 当前目标入口：[openspec/CURRENT.md](./openspec/CURRENT.md)
- 当前唯一产品 OpenSpec change：[`replace-account-members-with-friends`](./openspec/changes/replace-account-members-with-friends/)
- 历史 change：只读保留为审计与可复用证据，未完成任务不得继续驱动开发
- 工作台权威 Key：`work:agent-fabric`
- 工程工作区与命令：[Product Workspace Foundation](./docs/architecture/workspace-foundation.md)
- 版本更新记录：[CHANGELOG.md](./CHANGELOG.md)
- 认证与 SMTP 运维：[docs/architecture/authentication.md](./docs/architecture/authentication.md)

## 权威边界

1. Work Item 记录用户目标、当前进展和下一步。
2. `ARCHITECTURE.md` 记录跨模块长期架构决策。
3. OpenSpec 管理每次可实施变更的 proposal、design、specs 和 tasks。
4. 代码与测试必须满足当前已验证的 OpenSpec，不反向修改目标。

## OpenSpec 工作流

```bash
openspec status --change replace-account-members-with-friends
openspec validate replace-account-members-with-friends --strict --no-interactive
```

实现前先查看当前 change 的任务和规格；行为变化必须先更新对应 OpenSpec artifacts。

## 当前产品边界

- 每个 Human 只拥有一个个人 Account；Account 是其 Runtimes 和 Agents 的资源隔离边界，不提供 Account 切换。
- 好友关系属于 Human，不授予 Account 成员、管理员或资源所有权。
- `friends` Agent 只向活跃好友开放调用与安全摘要，Runtime、配置、Activity、Skills 和秘密始终由 Owner 私有管理。
- 一个 Account 可以创建和管理多个 Agent，不保留单账号单 Agent 约束。
- 当前阶段不建设 AgentSpec、Revision、Deployment、发布或回滚产品体系。
- MCP 只提供 `list_agents`、`find_agent`、`ask_agent`、`get_task`；不提供管理或权限扩张工具。
- Multica 固定提交只作 clean-room 研究参考，不进入产品源码、依赖、资产、品牌或文案。

## 登录能力

Desktop 支持普通邮箱六位验证码和 Google 系统浏览器登录。两种方式由 Better Auth 统一验证，并按已验证邮箱绑定同一个 Human；App 最终只保存一次性交换得到的设备凭据。验证码、OAuth token、Better Auth session 与 SMTP 密码不会进入 Renderer snapshot 或日志。邮箱登录只会在 SMTP 启动健康检查通过后出现在服务能力中。

## Source-first Gate

```bash
node --test scripts/verify-source-policy.test.mjs
node scripts/verify-source-policy.mjs
node scripts/verify-package-boundaries.mjs
node scripts/verify-release-gates.mjs --target development
```

商业发布使用当前 Account Agents 的 source、boundary、default-product、SBOM 和最终 macOS 发行物 Gate；历史 Matrix/Messenger 许可决策不再阻塞当前产品。

## Changelog 与 GitHub Release

用户可见改动在 `changelog/unreleased/` 增加一个条目；格式、分类与敏感信息边界见 [Changelog 贡献说明](./changelog/README.md)。发布前先预览，版本号同步后再切分：

```bash
pnpm changelog:check
pnpm changelog:preview
pnpm changelog:prepare -- 0.1.0-beta.2
```

生成的 `changelog/releases/<version>.md` 是 GitHub Release 正文的用户可见部分。版本切分提交推送后，可在 GitHub Actions 手动运行 `Create draft release`；它只创建 draft，不发布也不上传未经验证的资产。GitHub 自动生成的 PR、贡献者和完整比较链接只作补充；DMG 通过签名、公证、Gatekeeper 与隔离首次启动前，Release 必须保持 draft。

## Demo 边界

旧项目只提供技术证据：本机 Codex、出站连接、只读策略、多轮、MCP、macOS 分发和同机自闭环可行。旧代码不复制到本项目；局部逻辑只有在符合 Architecture v1 和新契约时才能重新实现或择优移植。
