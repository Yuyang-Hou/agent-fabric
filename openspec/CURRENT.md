# Current Product Authority

当前唯一产品与实施目标：[`replace-account-members-with-friends`](./changes/replace-account-members-with-friends/)。

它定义：

- 每个 Human 登录后只拥有自己的个人 Account，可在其中创建和管理多个 Agent 与私有 Runtime；
- “成员”被 Human 好友关系替代：邀请没有角色，接受后双方成为对称好友，不加入或管理对方 Account；
- Agent 访问模式只有 `private|friends`。好友开放的 Agent 同时出现在对方 Desktop Agent 管理和 Codex MCP 中，但只暴露安全摘要且不可管理；
- 产品没有 Account 切换、Workspace、项目、任务板或 App 聊天；Account 只是个人资源与 Runtime 的隔离边界；
- Codex 等本地 Agent 通过 MCP 发现本人或好友开放的 Agent，并通过标准 A2A 提问和读取仍有权限的 Task/Artifact；
- 当前阶段不建设 AgentSpec、Revision、Deployment、发布/回滚或持久化 Agent Card 产品体系；
- 界面和交互以固定 Multica 研究提交为 clean-room 参考，产品源码、资产、品牌、文案、Token 和组件必须独立实现。

`multica-aligned-agents-product` 及归档 change 只作为已交付基线、历史记录和可复用证据。它们的成员模型与未完成验收不得继续驱动产品；需求、设计、默认产品或验收与当前 change 冲突时，一律以当前 change 为准。已有且不冲突的自动更新、签名发布等能力继续由根规格约束。
