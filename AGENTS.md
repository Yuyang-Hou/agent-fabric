# Agent Fabric development guide

## Product boundary

- `openspec/CURRENT.md` 与 `openspec/changes/replace-account-members-with-friends/` 是当前唯一产品与实施权威；历史 change 只读保留，未完成任务不得继续执行。
- 当前产品是个人 Account 下的多 Agent 管理与创建、登录、Human 好友邀请、私有 Runtime 管理，以及 Desktop/Codex MCP 调用本人或好友开放 Agent 的标准 A2A 问答。好友不成为 Account 成员，也没有管理员角色。
- 不提供 Workspace、项目、任务板，也不在当前阶段建设 AgentSpec、Revision、Deployment、发布或回滚产品体系。
- `ARCHITECTURE.md` 是长期技术架构基线。
- 对外 Agent 数据面只使用标准 A2A；Control Plane 不是 A2A 私有扩展。
- Runtime Adapter 只存在于 Edge Host 内部，Runtime session ID、cwd、凭证和私有上下文不得离开 Edge。
- Cloud 不运行 Owner Agent，不托管模型凭证，不默认长期保存原始 Prompt、答案或 Artifact。
- Colleague Mesh 是首个产品场景，不是平台协议边界。
- `colleague-agent-mesh` P0–P7 是冻结 Demo；不得复制其私有 `/api/tasks`、状态枚举或 Store 作为新系统基础。

## OpenSpec workflow

- 所有行为变化必须由 OpenSpec change 驱动。
- 实现前先完成并评审 proposal、design、specs、tasks。
- 每个 Requirement 至少包含一个 `#### Scenario`，使用 SHALL/MUST 表达可验收行为。
- 完成任务时同步勾选 `tasks.md`，并保留测试证据。
- 交付前运行：

  ```bash
  openspec validate replace-account-members-with-friends --strict --no-interactive
  openspec validate --all --strict --no-interactive
  ```

## Engineering rules

- 新分支名称不要包含 `/`。
- 默认拒绝网络、写入和副作用；权限必须显式配置。
- A2A 类型应从固定官方规范生成或校验，不手写漂移副本。
- Runtime Adapter 必须有 Fake Runtime 契约测试，Codex 只是第一个真实实现。
- 身份、授权、撤权、离线、取消、多轮隔离、递归预算和敏感信息泄漏必须有自动化场景。
- 保持模块边界清晰，即使 MVP 暂时部署在单进程中也不能混合领域职责。
- 进入产品的第三方包或源码必须登记在 `config/third-party-sources.json`，并通过 source policy；Multica 源码仅供研究，不得进入产品目录或依赖。
- 发布必须通过当前 Account Agents 的 source、boundary、default-product、SBOM、最终 App/DMG、签名、公证、Staple、Gatekeeper 和 quarantine 首启 Gate；历史 Matrix/Messenger Gate 不属于当前产品。
