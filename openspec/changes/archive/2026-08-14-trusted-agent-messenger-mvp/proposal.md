## Status

**Superseded for the default product path.** 本 change 仅保留为 Matrix/E2EE Messenger 的历史研究与测试证据；新的产品实现以 `minimal-agent-friend-messaging` 为唯一任务清单，不再从这里扩展默认入口。

## Why

Agent Fabric 当前的 Foundation 只定义了 A2A 服务化基础设施，尚不能交付用户真正可用、可理解的产品。竞品调研表明，更有差异化和验证价值的切入点是可信 Agent Messenger：两个真实用户先建立信任关系，再让各自留在本机的 Agent 在端到端加密会话中协作。

## What Changes

- **BREAKING**：产品 App 不再只是统一 A2A Client；它同时承担端到端加密房间、联系人信任和人类授权入口。旧 `agent-fabric-v1-foundation` change 保留为架构研究，不作为本 MVP 的直接任务清单。
- 建立 macOS 首发的 1 对 1 可信联系人流程；邀请、接受、拒绝、撤销和设备验证只能由人执行。
- 建立端到端加密的四方会话模型：用户、用户的本机 Agent、联系人、联系人的本机 Agent。云端只处理密文和最小路由元数据。
- Electron main 管理一个隔离、无界面的 Crypto Worker/WebContents；它独占 Matrix Client、Rust Crypto、设备密钥与持久 IndexedDB，普通 Renderer 只能接收最小 UI 投影和提交用户意图。
- 在会话中通过 `@Agent` 创建可跟踪工作，使用 A2A v1.0.1 的 Message、Task、Context、TaskState 和 Artifact 语义表达任务、多轮、结果与取消。
- 默认产品入口中的 `@Agent` 必须路由到目标 Edge 与真实 Runtime：本机 Agent 直接调用本机 Runtime Adapter，远端 Agent 通过加密房间等待其 Owner Edge 接收；未收到真实 Runtime 终态时不得生成演示 Artifact 或伪造完成状态。
- 本机 Agent 首版通过当前 Codex 对话中的“发布为 Atlas”工作流创建。Codex 将当前有效上下文压缩为有来源标记、大小受限且可预览的上下文快照；本机 CLI 在 Owner 再次确认后把快照交给 Edge。Edge 创建新的私有 Runtime session、注入快照，并在启动及每次执行前从当前本机配置重新发现 Skills/MCP。上下文快照不冒充原 thread，也不复制隐藏推理、凭证、原始 Runtime ID 或完整历史。
- Edge Host 使用 Runtime-neutral ACP 边界驱动本机 Agent；首个 Runtime 为 Codex，采用官方 `codex-acp` 并封装在自有 Runtime Adapter 后。Paperclip 执行器已在 M1 因控制面耦合和不安全默认值被拒绝。
- 采用 source-first 实现策略：Matrix SDK 提供 E2EE/同步，assistant-ui 提供消息与任务 UI，ACP/A2A 官方 SDK 提供协议模型；项目只实现产品差异、协议适配和安全策略。Paperclip 仅保留为契约与工具设计参考，不进入产品依赖。
- 首版只支持文本、一个联系人会话中每人最多挂载一个由上下文快照发布的 Agent、只读 Runtime 能力、显式取消和连续追问。
- 明确非目标：群聊、移动端、能力市场、计费、公开 Agent 目录、写文件、部署、付款、Cloud Agent、P2P/WebRTC 和自行实现密码学。

## Capabilities

### New Capabilities

- `trusted-contact-relationship`: 人与人建立、验证和撤销可信联系人关系，以及联系人关系对房间和 Agent 调用的授权约束。
- `encrypted-agent-room`: 1 对 1 端到端加密房间、四方参与者、离线消息、设备验证和最小云端可见数据。
- `human-authority-policy`: 关键关系、设备、Agent 挂载、授权和敏感动作必须由人确认，Agent 不得自行提升权限。
- `room-task-lifecycle`: 从房间内 `@Agent` 到 A2A Task、流式状态、Artifact、取消和同一 Context 连续追问的产品行为。
- `local-runtime-bridge`: Edge 通过 ACP/可替换 Runtime Adapter 驱动本机 Codex，隔离私有 Session、cwd、凭证和上下文。

### Modified Capabilities

无。当前主规格目录尚无已归档 capability；旧 Foundation change 保持独立且不被覆盖。

## Impact

- Product UI：新增 Electron macOS App、main 管理的隔离 Crypto Worker/WebContents、联系人、加密会话、Agent 参与者、任务卡片和人类授权入口。
- Message Plane：引入 Matrix Client SDK 及可替换 Homeserver；正式商业发布前必须完成服务端许可证决策。
- Agent Data Plane：A2A 仍是可互操作的工作语义和外部 Agent 接口，但房间密文传输不伪装成新的 A2A binding。
- Edge Host / Runtime Adapter：引入 ACP Client 和 Codex ACP Adapter；增加本地上下文快照接收、Human 确认、新 session 创建、私有绑定、能力重检和连续恢复；Runtime 会话标识、快照正文、原始历史与本地权限状态不得离开 Edge。
- Control Plane：联系人、设备、Agent 归属、Grant、Presence 与撤权仍属于私有控制面；不得读取房间正文。
- Supply Chain：所有第三方源码或包必须记录来源、固定版本、许可证、修改范围、NOTICE 要求和可替换边界。
