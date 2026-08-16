# Changelog 条目

所有用户可见改动在合并前向 `changelog/unreleased/` 增加一个 Markdown 文件。文件名使用小写短横线，例如 `multi-agent-catalog.md`：

```md
category: added

现在可以在一个 Account 中创建和管理多个智能体。
```

允许的分类按发布展示顺序为：

- `breaking`：需要用户调整使用方式的破坏性变化
- `added`：新能力
- `changed`：已有能力或体验改进
- `fixed`：用户可感知的问题修复
- `security`：安全修复或安全边界加强

正文必须是 6–240 个字符的单段用户语言，不写提交号、内部 ID、凭据、OAuth 数据、证书身份、绝对路径或实现日志。纯测试、重构、构建维护等无用户可见变化的 PR 应添加 `changelog:skip` 标签，并在 PR 中说明原因。

常用命令：

```bash
pnpm changelog:check
pnpm changelog:preview
pnpm changelog:prepare -- 0.1.0-beta.2
```

`prepare` 只用于已同步更新根包与 Desktop 包版本后：它把条目归档到 `changelog/archive/<version>/`，生成 `changelog/releases/<version>.md`，并把完全相同的版本段落写入根 `CHANGELOG.md`。正式 GitHub Release 在签名、公证、Gatekeeper 和首次启动全部通过前保持 draft。

版本切分提交推送到个人 GitHub 后，可以在 Actions 手动运行 `Create draft release`，输入同一版本和目标分支。工作流会重新校验版本与历史，只创建 `v<version>` draft Release；DMG 上传和最终 Publish 仍以本机发行验收为前置条件。
