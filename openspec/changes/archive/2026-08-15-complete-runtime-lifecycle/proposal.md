## Why

当前 Desktop 的 Runtime“重新检测”只把 Control Plane 记录改为 `checking`，没有触发本机 Edge 对真实 Runtime 的再次探测，也没有把结果回写为终态，导致用户操作永久卡住。该缺口同时暴露出既有验收链路把 API 返回、组件渲染和构建通过误当成了完整产品可用。

## What Changes

- 将 Runtime 检测生命周期收归 Desktop Main / Edge Host：真实本机探测是状态事实来源，Renderer 只发出意图并订阅结果。
- 重新检测必须串行执行、设置有界超时，并在成功、鉴权缺失、不可用、离线或探测失败时收敛到非 `checking` 终态。
- 只允许本机拥有的 Runtime 执行本机检测；远端 Runtime 明确显示不可在此设备控制，不能伪装成功。
- 把 Runtime 状态变化推送给 Renderer，并保留运行实例身份，避免路由重挂载造成重复检测或丢失结果。
- 增加成功、失败、超时、并发点击、重启恢复和真实 App 点击验收；静态 fixture、单一 API 测试和构建成功不再作为产品行为完成证据。
- 将 Runtime 恢复后的真实 MCP → A2A 问答纳入验收；Runtime 心跳或投影版本变化不得替换进行中 Task 所在的 Task Store，也不得出现 Edge 已完成但调用方收到 `agent-unavailable`/`get_task` 无期限等待。
- 让已启动的 Codex MCP 在 Desktop 重启并原子更新本机 loopback 配置后自动使用新地址和令牌，无需重启 Codex 会话。
- 让已建立过连接的 Runtime tunnel 在网络或 Cloud WebSocket 中断后有界自动重连；心跳版本冲突不得毒化后续 observation 队列。
- 纠正主 change 中 Runtime refresh/UI 的错误完成标记，直到真实端到端验收通过。

明确非目标：不增加 Workspace、项目、任务板、AgentSpec、Revision、Deployment、发布/回滚能力；不改变标准 A2A 数据面；不把 Runtime 凭据、cwd、私有配置或原始错误上传 Cloud；本 change 不执行签名、公证、打包或安装。

## Capabilities

### New Capabilities

- `runtime-lifecycle`: 定义 Account Runtime 本机探测、刷新收敛、状态推送、并发/超时保护和真实产品验收。

### Modified Capabilities

无。

## Impact

- **Product UI**：Runtime 列表/详情的检测动作、加载态、终态、远端控制提示与状态更新。
- **Edge Host / Desktop Main**：本机 Runtime 生命周期协调器、探测串行化、超时、状态事件和会话清理。
- **Control Plane**：继续保存 Account-scoped Runtime 投影与乐观并发版本，不承担本机探测。
- **Runtime Adapter**：Codex Adapter 仍提供真实 detect/capability 结果；不暴露私有 Runtime 数据。
- **A2A**：无协议变化。
- **A2A Task 生命周期**：复用每个 Agent 的稳定 Task Store，并为读取路径设置有界失败，保证 Runtime 心跳期间仍可取得真实终态和文本 Artifact。
- **MCP Host**：每次本机 Gateway 调用读取并校验当前原子配置，Desktop 重启后不保留失效的 loopback 地址或令牌。
- **Runtime tunnel**：已成功启动后的意外断线按有界退避重连；显式停止立即取消重连和心跳。
