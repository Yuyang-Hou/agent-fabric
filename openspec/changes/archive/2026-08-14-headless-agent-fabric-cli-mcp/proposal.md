## Status

**Paused and superseded for the default product path.** 本 change 仅保留 Headless、自部署、ContextCapsule 与旧 MCP 的历史证据；新的产品实现以 `minimal-agent-friend-messaging` 为唯一任务清单，不再从这里扩展默认入口。

## Why

当前 Electron Messenger 把“发布、授权、调用、问答”都绑定在 Agent Fabric App 内，既增加用户心智成本，也无法满足用户希望在自己或他人的 Codex 中直接调用 Atlas 的核心目标。同时，现有 Control Plane 只有领域边界，没有可被其他机器和用户低成本部署、迁移和维护的独立服务端交付物。

## What Changes

- 将首要产品入口改为 Codex Plugin（Skill + MCP）和 `agent-fabric` CLI：用户在 Codex 中发布当前有效上下文、发现 Agent、提问、委派任务并获取结果，不要求安装或打开 Electron App。
- 发布内容改为受限、不可变的 `ContextCapsule`；每个外部调用方和 A2A `contextId` 使用隔离的派生 Runtime Session，避免共享同一个可变 Codex 会话。
- 人类 Owner 可直接创建仅本机可见的 Agent Revision；任何对其他用户的分享、授权、撤权均只能通过交互式 CLI 完成，Skill、MCP、A2A 请求和 Agent 自身不得提升权限。
- Edge Host 作为无界面本机守护进程运行，通过出站认证长连接接收调用；Owner 的模型凭证、cwd、Runtime Session ID、私有 AgentSpec 和上下文正文留在本机。
- 建立可独立部署的 A2A Control Plane/Gateway 服务端，提供身份与设备认证、Agent Registry/Card、Grant、Presence、标准 A2A 路由、任务状态/取消和 Edge 出站通道。
- 把自部署作为正式产品能力：提供独立 OCI 镜像、Docker Compose、默认 PostgreSQL 持久化、可选托管 MySQL 适配、自动迁移与初始化、健康检查、备份恢复、导入导出、版本兼容检查和可选 TLS 入口，不依赖特定云厂商。
- Electron/Matrix Messenger 不删除，但退出本阶段默认产品路径，后续可作为相同 CLI/MCP/A2A 能力上的可选图形客户端重新设计。
- 明确非目标：不让 Cloud 运行 Owner Agent，不在 Cloud 默认长期保存 Prompt/答案/Artifact 正文，不接管原 Codex thread，不开放默认写文件、网络、部署或付款能力，不在本阶段实现群聊、市场和计费。

## Capabilities

### New Capabilities

- `headless-cli-and-plugin`: Codex Skill、MCP 工具与 CLI 的安装、发布、发现、问答、委派、授权、撤权、诊断和稳定机器可读接口。
- `edge-publication-runtime`: ContextCapsule 发布、本机守护进程、Runtime 能力重检、按调用方与上下文隔离的派生 Session、取消和隐私边界。
- `a2a-control-plane-gateway`: 身份、Agent Registry/Card、Deployment、Grant、Presence、A2A HTTP 路由、Edge 出站通道和任务生命周期。
- `self-hosted-server-distribution`: 可移植服务端镜像与 Compose 分发、PostgreSQL/MySQL 持久化适配、初始化、升级兼容、健康检查、备份恢复和迁移。

### Modified Capabilities

无。当前主规格目录尚无已归档 capability；本 change 在既有 Foundation 边界上定义新的产品交付能力，并暂停 `trusted-agent-messenger-mvp` 作为默认实现路径。

## Impact

- A2A：继续固定 A2A v1.0.1 HTTP+JSON/REST，补齐可供外部 Codex/MCP Client 调用的生产 Gateway 与任务路由。
- Control Plane：从占位模块扩展为可独立打包、自部署、持久化和迁移的服务端；仍只持有治理与路由元数据。
- Edge Host / Runtime Adapter：增加无界面守护进程、出站通道、ContextCapsule Revision 和隔离 Session 管理，复用 Runtime-neutral 契约。
- CLI / Codex：新增稳定 CLI、Codex Plugin、Skill 指引和 MCP Server；问答结果回到调用者原本的 Codex 对话。
- Product UI：Electron/Matrix 代码保留但不作为该阶段安装、发布或调用的前置条件。
- 部署与运维：新增独立 OCI 构建、Compose/PostgreSQL 默认拓扑、托管 MySQL 适配、迁移、备份恢复、健康检查、版本兼容与部署文档；未来即使拆分独立服务端仓库也保持相同镜像和配置契约。
