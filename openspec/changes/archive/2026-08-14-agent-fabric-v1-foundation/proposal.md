## Why

现有 Codex-only Demo 已证明本机 Agent 跨设备调用可行，但它使用私有 Task API 和实验性模块边界，无法作为跨 Runtime、可兼容第三方 A2A Agent 的长期基础。现在需要从 Architecture v1 建立干净、可验证的领域契约和最小纵切，避免继续围绕 Demo 累积兼容负担。

## What Changes

- **BREAKING**：新系统不兼容 Demo 的 `/api/tasks`、私有状态枚举、conversation API 和 Gateway Store。
- 固定 A2A v1.0.1 HTTP+JSON/REST 为唯一外部 Agent 数据面。
- 建立私有 AgentSpec → 公开 Agent Card 的版本化发布模型。
- 建立 Runtime Adapter v1、Edge Session Manager 和 Policy Engine 契约。
- 建立 Principal、Registry、Grant、Deployment、Presence 和 Router 控制面。
- 建立 Client → A2A Router → Edge Host → Fake Runtime 的首个可测试纵切。
- 暂不实现产品 UI、真实 Codex Adapter、写能力审批恢复、P2P、Cloud Shadow 或私有 A2A Profile。

## Capabilities

### New Capabilities

- `agent-spec-lifecycle`: 本机 AgentSpec、不可变 Revision、Deployment、Agent Card 投影、自检与回滚。
- `a2a-agent-service`: A2A Agent Card、Message、Task、Context、Artifact、查询与取消的标准服务能力。
- `runtime-adapter-host`: Edge Host 通过统一 Runtime Adapter 创建、恢复、执行和取消本机 Runtime Session。
- `control-plane-routing`: Principal、Registry、Grant、Presence 和出站通道路由组成的最小控制面。

### Modified Capabilities

无。该项目从空白规格开始。

## Impact

- 新建 Agent Fabric 独立项目、领域模型和 OpenSpec 生命周期。
- 首批实现预计包含共享领域包、A2A Server/Client、Control Plane、Edge Host 和 Fake Runtime。
- 外部依赖将固定 A2A v1.0.1 类型或 Schema；具体 SDK 在设计评审后选择。
- 旧 `colleague-agent-mesh` 项目保持冻结，仅作为测试场景和技术探索参考。
