# Changelog

本文件记录 Agent Fabric 已发布版本中用户可感知的变化。尚未发布的条目保存在 [`changelog/unreleased/`](./changelog/unreleased/)，贡献与发布规则见 [`changelog/README.md`](./changelog/README.md)。

## [Unreleased]

## [0.1.0-beta.3] - 2026-08-16

### ⚠️ 破坏性变更

- 成员协作现已替换为双向好友关系；接受邀请不会进入对方 Account，好友只能发现和调用对方明确开放的智能体。

### ✨ 新增

- macOS 桌面端新增受控的 Beta 自动更新检查、下载提示和明确安装确认，并对更新资产执行完整性与发行契约校验。

## [0.1.0-beta.2] - 2026-08-15

### 🔧 改进

- Agent Fabric 现在只展示和交付 Account 下的多智能体、Runtime、成员管理与 Codex MCP，旧版单智能体、发布和消息模块不再随产品提供。
- App 图标和应用内智能体标识现已统一为无嘴的黑色球体与双眼留白图形，小尺寸和单色场景也能清晰辨识。
- GitHub Release 现在会展示按类别整理的用户可见更新内容，并在仓库保留完整版本历史。

## [0.1.0-beta.1] - 2026-08-14

### ✨ 新增

- 支持使用 Google 登录并在一个 Account 中管理成员、Runtime 和多个智能体。
- 支持空白创建、模板创建、AI Builder、草稿恢复、智能体详情配置、访问权限、活动与归档恢复。
- 提供面向本地 Codex 的 MCP，可发现有权访问的智能体并通过标准 A2A 提问和读取任务结果。

### 🔧 改进

- 桌面端采用面向 macOS 的紧凑界面，统一智能体、Runtime 和成员管理体验。
- 首个 Apple Silicon 测试版使用 Developer ID 签名、公证和可验证的 DMG 分发。
