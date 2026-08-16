## Context

Agent Fabric 要把本机真实 Agent Runtime 生产并部署为受治理的 A2A 服务。旧 Demo 已跑通 Codex、出站 WSS、多轮、只读策略、MCP 和 macOS 分发，但它同时混合了控制面、私有任务协议、Runtime 驱动和产品入口。

本项目从 Architecture v1 重新实现。首个里程碑不追求完整产品，而是建立能够独立替换 Runtime、Client 和部署方式的稳定契约，并用 Fake Runtime 证明端到端边界。

## Goals / Non-Goals

**Goals:**

- 固定 A2A v1.0.1 REST 最小子集及其领域映射。
- 定义 AgentSpec v1、Revision、Deployment 和 Agent Card 投影。
- 定义 Runtime Adapter v1、Context/Session 映射和策略边界。
- 建立最小 Control Plane 与只出站 Edge 路由。
- 用自动化契约测试验证多轮、隔离、取消、撤权、离线和敏感信息边界。

**Non-Goals:**

- 不兼容旧 Demo API，也不原地迁移旧 Store。
- 不实现真实 Codex/Claude Adapter、产品聊天 UI 或 macOS 安装包。
- 不开放写文件、外网、部署等副作用能力。
- 不实现 P2P、离线云端代答、第三方 A2A Extension 或完整企业 SSO。

## Decisions

### 1. 标准 A2A 是唯一外部数据面

首版固定 A2A v1.0.1 HTTP+JSON/REST，至少实现 Agent Card、Send Message、Get/List/Cancel Task。答案和证据使用 Artifact Parts，多轮使用 contextId；不创建私有顶层字段。

选择原因：标准已覆盖发现、自描述、消息、任务、多轮、产物和取消，能够避免 App、MCP、CLI 各自形成协议。JSON-RPC、gRPC 和 Streaming 可在同一领域模型上后续增加。

备选方案：沿用 Demo 私有 Task API，开发更快但会固化 Runtime 和产品入口，因此拒绝。

### 2. Control Plane 与 A2A 分离

Principal、Registry、Grant、Invitation、Deployment、Presence、限流、撤权和 Router 属于产品控制面。A2A Agent Card 声明服务和鉴权，调用仍通过标准 A2A 接口。

选择原因：组织关系和好友授权是产品语义，不应污染互操作协议。MVP 可单进程部署，但领域模块和 Repository 必须分离。

### 3. AgentSpec 私有，Agent Card 是脱敏投影

AgentSpec 保存在 Edge，包含 Runtime、工作区、Skills/MCP、策略和部署设置。每次修改生成不可变 Revision；公开 Agent Card 只包含 Owner 允许暴露的能力摘要、稳定接口和鉴权要求。

选择原因：本地路径、凭证和工具配置不能成为发现元数据。Revision/Deployment 分离使 Agent ID 在换设备、换 Runtime 和回滚时保持稳定。

### 4. Edge Host 通过 Runtime Adapter 驱动 Runtime

Runtime Adapter v1 只负责 detect、inspect capabilities、create/resume session、execute、cancel 和 close，并输出统一 RuntimeEvent。Session Manager 负责 A2A contextId 到私有 Runtime Session 的映射；Policy Engine 负责权限和预算。

选择原因：Runtime 私有会话模型变化频繁，不能进入 A2A 或 Control Plane。首个纵切使用 Fake Runtime，避免一开始被 Codex app-server 细节绑架。

### 5. Edge 只建立出站连接

Control Plane Router 通过 Edge 主动建立的安全长连接转发 A2A 请求。本机不监听公网端口，Cloud 不运行 Owner Agent，也不托管模型凭证。

选择原因：适配 NAT、公司网络和个人设备，并缩小攻击面。P2P 可减少中转，但增加连通性和安全复杂度，首版不采用。

### 6. 新项目干净实现

旧 Demo 只作为行为证据和测试样本。新项目先实现领域和契约，不桥接 `/api/tasks`，也不保留旧 conversationId API。

选择原因：本次目标就是验证 Architecture v1 本身；兼容层会掩盖领域边界是否真正成立。

## Target Modules

```text
packages/domain             stable domain objects and policies
packages/a2a                generated/validated A2A types, server and client
packages/agent-spec         schema, validation and Agent Card projection
packages/runtime-contract   Runtime Adapter v1 and contract test suite
apps/control-plane          identity, registry, grants, presence and router
apps/edge-host              tunnel, policy, sessions and adapter orchestration
adapters/runtime-fake       deterministic foundation adapter
adapters/runtime-codex      first real adapter in a later change
```

## Risks / Trade-offs

- [A2A v1.x 仍可能小版本演进] → 固定 v1.0.1 Schema、增加 conformance fixtures，并把协议类型隔离在 `packages/a2a`。
- [单进程 MVP 重新混合职责] → 以包依赖规则和接口测试强制边界，部署拓扑不等于代码边界。
- [Gateway 能瞬时看到正文] → TLS、正文日志默认关闭、最小保留；端到端加密另立 ADR。
- [Fake Runtime 与真实 Runtime 差异] → 契约测试覆盖背压、取消、审批、错误和 Session 失效；Codex Adapter 必须复用同一套测试。
- [过早设计完整平台] → Foundation 只交付四个 capability 和最小纵切，UI、真实 Runtime 与高级治理拆分后续 change。

## Migration Plan

本项目不迁移旧运行数据或 API：

1. 冻结 Architecture v1、AgentSpec v1、Runtime Adapter v1 和 A2A 映射。
2. 用 Fake Runtime 建立新项目最小纵切并完成契约测试。
3. 在后续 change 新建 Codex Adapter，选择性重新实现 Demo 已验证逻辑。
4. 新系统达到同等只读能力后再决定内测设备是否重新登记；旧 Demo 始终可独立回退。

## Open Questions

- A2A 官方类型采用生成代码、官方 SDK 还是 Schema 校验组合？
- Foundation 的 Task/Context 索引先使用内存 Repository 还是 SQLite？
- Edge 与 Router 的首个长连接传输采用 WebSocket 还是基于 HTTP/2 的流？
- 稳定 Agent Base URL 首版使用 Gateway path，何时引入独立子域名？
