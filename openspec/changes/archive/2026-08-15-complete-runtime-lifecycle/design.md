## Context

Desktop 启动时由 Main 创建 Codex ACP Adapter，Account Runtime Registration Service 负责一次真实探测、注册/观测与出站执行隧道；Renderer 只读取 Control Plane 中的 Runtime 投影。当前刷新路径却直接调用 Control Plane 的 `refresh` API，把记录改成 `checking` 后立即返回，没有通知本机 Registration Service 再次探测，因此状态不会收敛。创建页只允许选择 `ready` Runtime，于是该缺口直接阻断 Agent 创建。

打包路径还有独立缺口：`codex-acp.mjs` 默认尝试解析未随 App 分发的 `@openai/codex/bin/codex.js`。虽然本机 ChatGPT App 已包含并登录可用的 Codex 可执行文件，Desktop Main 没有使用既有可执行文件解析器，也没有向子进程传 `CODEX_PATH`，所以真实打包 App 无法启动该 Runtime。

Runtime 凭据、Codex Home、可执行文件路径、cwd、Runtime session ID、私有配置和原始错误仍属于 Edge 私有数据。Control Plane 只保存有界健康状态、能力摘要与检测时间；Renderer 只接收经过 Schema 校验的投影。

## Goals / Non-Goals

**Goals:**

- 让打包 Desktop 从显式配置、PATH 或已安装 ChatGPT App 中解析真实 Codex 可执行文件，并仅把解析结果传给本机 `codex-acp` 子进程。
- 让启动和用户触发的 Runtime 检测都由同一个本机生命周期协调器执行，并在有界时间内收敛到 `ready`、`auth_required`、`unavailable` 或 `offline`。
- 串行化同一 Runtime 的并发刷新，拒绝从当前设备控制不属于本机 Registration Service 的 Runtime。
- 通过既有 Account 失效事件和 Host 快照把 `checking` 及终态推送给 Renderer，同时保持同一个 Main/Edge 实例和执行隧道身份。
- 用 Fake Runtime 覆盖成功、认证缺失、失败、超时、并发和重启恢复，并用最终打包 App 的真实点击路径证明 Runtime 可选。
- 用真实本机 MCP 发起一次标准 A2A 问答，证明 Runtime 心跳/版本变化不会让调用方丢失已完成 Task。
- 让既有 Codex MCP 进程在 Desktop 重启后自动读取新的本机 loopback 配置，并让既有 Runtime tunnel 从瞬时断线中恢复。

**Non-Goals:**

- 不增加 Runtime Provider、Workspace、项目、任务板、发布/回滚或私有 A2A 扩展。
- 不把 Codex 路径、凭据、私有能力内容、Runtime session ID、cwd 或原始错误上传 Cloud 或 Renderer。
- 不在本 change 内执行签名、公证、Staple、Gatekeeper 或正式发行。

## Decisions

### 1. Desktop Main / Edge Registration Service 是检测生命周期唯一协调者

`AccountRuntimeRegistrationService` 保存本机已注册 Runtime、Adapter 和 Cloud observation port，并新增可串行调用的刷新操作。Desktop Host 的 `runtime-refresh` 命令先委托该本机服务，而不是把 Control Plane 的 `checking` 响应当成结果。服务负责标记 `checking`、执行真实 `detect`/`inspectCapabilities`、再以返回的新版本写入终态。

选择这一方案是因为 Adapter 与本机 Runtime 身份已经由 Registration Service 持有，能在不把私有句柄交给 Renderer 或 Control Plane 的前提下验证“是否本机 Runtime”。备选方案是让 Control Plane 回调 Edge；这会增加入站控制协议和路由状态，且与 Edge 仅出站连接的边界冲突。另一个备选方案是刷新时销毁并重建整个 Account Session Service；它会无谓重启 MCP 和执行隧道，并引入可见离线窗口。

### 2. 检测采用单飞、超时和明确终态映射

同一 Registration Service 同时只允许一个探测 Promise；重复点击复用该 Promise，不重复拉起 Codex 进程，也不重复递增 Runtime version。探测具有固定上限，成功映射为 `ready`，认证失败映射为 `auth_required`，可执行文件/协议不可用映射为 `unavailable`，超时、断连或无法完成观测映射为 `offline`。无论结果如何，只要仍持有本机 Runtime，服务都尝试写入非 `checking` 终态。

Control Plane 继续负责乐观并发。生命周期协调器只使用服务器最新返回的 version 继续 observation；若发生版本冲突，它重新读取同一 Runtime，并且仅在 Runtime 仍由当前用户、本机 provider/adapter 记录匹配且仍为 `checking` 时重试一次终态 observation。

### 3. 启动恢复复用同一检测流程

登录恢复时，Registration Service 先列出当前用户的匹配 Runtime，再执行有界真实探测。若已有记录停留在 `checking`，启动流程不会沿用该状态，而是覆盖为本次真实终态；没有记录时则用本次终态注册。执行隧道只在注册/观测完成后启动，隧道失败会把 Runtime 收敛为 `offline`。

选择复用同一流程可避免启动探测与按钮刷新分别维护状态映射。仅依赖定时任务清理陈旧 `checking` 的备选方案不能证明 Runtime 当前可用，也无法恢复 Agent 创建。

### 4. 打包 App 显式解析并传递 `CODEX_PATH`

Desktop Main 调用 Edge Host 的 `resolveCodexExecutablePath`，解析顺序为：显式 `CODEX_PATH`、继承 PATH、系统 `/Applications/ChatGPT.app/Contents/Resources/codex`、用户 Applications。解析到的绝对可执行路径只进入 `NodeCodexAcpProcessFactory` 的子进程环境，覆盖 `codex-acp` 的默认查找；未解析到时让检测返回稳定的 unavailable reason code。

不把 `@openai/codex` JavaScript 包复制进产品，也不依赖 Renderer 选择文件。这样复用用户已安装且已认证的官方本机 Runtime，避免双份凭据和供应链内容，同时保持路径只在 Edge 内。

### 5. Renderer 只展示真实状态与可执行恢复动作

Renderer 继续只把 `ready` Runtime 放入 Agent 创建下拉。刷新期间按钮展示进行中；终态由 Host 快照/Account 失效事件更新。远端 Runtime 的刷新按钮禁用并说明“需在 Runtime 所在设备检测”；认证缺失展示终端登录指引；不可用/离线展示可重试但不泄露原始错误的消息。

不采用在 UI 中把 `checking` 强行改回 `ready` 或允许绑定非健康 Runtime 的方案，因为这会制造错误的产品状态并把故障推迟到 A2A 执行阶段。

### 6. 验收以最终 App 行为为准

自动化分三层：生命周期协调器 Fake Adapter 测试、Desktop Host/IPC 状态测试、打包资源与 Codex 路径探测。最终验收必须启动本次构建的 App，登录同一 Account，点击“重新检测”，观察非 `checking` 终态和非零真实能力，再进入创建页实际选中该 Runtime。仅 API 200、组件渲染、fixture、构建或安装成功均不算完成。

### 7. A2A Handler 更新与 Task Store 生命周期解耦

Runtime 心跳会更新 Runtime 投影版本，但它不是 A2A Task Store 的生命周期边界。`AccountAgentA2ARegistry` 为每个 Agent 保留稳定的 Task Store；Agent Card/Handler 可以随 Agent 或 Runtime 投影更新，进行中与已完成 Task 仍由同一 Store 读取。这样 `sendMessage` 返回后，即使发生心跳或配置投影更新，`getTask` 也不会落到一个空的新 Store。

调用方读取 Task 仍使用标准 A2A，不增加私有数据面。客户端等待和读取必须有界；Edge 已完成但调用方因 Store 被替换而得到 `agent-unavailable`、`task-unavailable` 或无期限等待都视为失败。

### 8. MCP Host 以配置文件作为可轮换的本机连接事实

Codex MCP 进程保留稳定的 stdio 生命周期，但不缓存 Desktop 启动时的 loopback 地址和令牌。每次工具调用都从既有原子配置文件读取并校验当前 `localHost`、`localToken` 与有效期，再构造本次本机 Gateway client。Desktop 重启替换配置后，下一次工具调用自动使用新连接；配置暂时不存在或无效时只返回有界本机不可用错误，后续调用仍可恢复。

不让 Desktop 固定端口或复用旧令牌。随机 loopback 端口、进程级撤权和原子私有文件仍是安全边界；MCP 输出、日志和错误不得包含地址、令牌或配置文件内容。

### 9. Runtime tunnel 断线恢复与 observation 队列解耦

Runtime tunnel 在首次连接成功后进入“应保持连接”状态。非显式关闭或网络错误会清理旧 socket/heartbeat，并以有界退避创建新 socket；同一时刻只允许一个连接或重连计时器。显式 `stop` 必须取消计时器、关闭 socket、停止 heartbeat，并保证随后不再重连。

Cloud 的 heartbeat observation 不再永久依赖 WebSocket 建立时捕获的 Runtime version。每次 observation 使用最新 Runtime 投影；若发生一次乐观并发冲突则有界重读并重试。单次 observation 失败不得让 Promise 队列永久 rejected，下一次 heartbeat 仍可推进。断线 offline observation 同样基于最新 version，且不得覆盖已由新连接恢复的在线事实。

### 10. Account 失效事件连接必须具备应用层存活检测

Cloud 定期向已认证的 Account events WebSocket 发送不含业务数据的 heartbeat frame。Desktop Main 对任意合法传输帧刷新存活期限；超过期限仍未收到 frame 时主动废弃旧 socket，并复用既有有界退避创建新连接。旧 socket 的延迟 close/error 不得清理新连接或重复创建重连计时器。

仅依赖 TCP close/error 不足以覆盖 Cloud 实例替换：代理可能让客户端保留一个不再承载后端事件的半开连接，界面会永久停在“重连中”且丢失活动刷新。heartbeat 只用于连接存活，不进入 Renderer，不携带 Account、Agent、Task 或凭据内容。

### 11. 恢复失败与凭据失效分开处理

Desktop 启动恢复只在 Cloud 明确返回未认证/无权访问或 Account 身份不一致时清除安全存储中的 App session。网络失败、Cloud 部署窗口、5xx/非认证协议错误或版本暂不兼容只停止本机 session services、保留凭据，并显示有界的可重试状态；下次恢复不得要求用户重新完成 Google 登录。

首次 Google 登录交换后的激活失败仍清除新凭据，避免留下未完成激活的 session。该规则只改变“已有凭据的启动恢复”，不放宽服务端认证与撤权。

Railway MySQL 的 prepared-statement 路径不接受这些分页查询中的 `LIMIT ?` 绑定。所有 limit 先经过既有 Schema/数值边界校验，再作为整数文字写入固定 SQL 模板；用户输入、游标和身份字段仍只使用参数绑定。这样避免登录后的并行首屏集合查询同时以 `Incorrect arguments` 失败。

## Risks / Trade-offs

- [Codex 探测超时后子进程仍存活] → Adapter 在超时/断连时清理连接或由生命周期协调器触发安全 shutdown；测试断言无重复活跃探测。
- [Control Plane version 在 checking 与终态之间变化] → 使用服务器返回 version，并对仍属于本机且仍 checking 的记录做一次有界重读/重试，其他冲突保留服务端事实。
- [多个同 provider/adapter 的历史 Runtime 记录] → 启动时只接管当前 Account、当前 Owner 的最新匹配记录；远端或其他 Owner 记录不可被本机刷新。
- [ChatGPT App 更新移动可执行文件] → 解析器保留显式路径与 PATH 优先级，打包验收直接检查最终可执行路径；未找到时稳定显示 unavailable。
- [检测终态写入失败导致 checking 残留] → Host 返回可恢复错误，启动恢复重新探测；服务端可按陈旧 observation 判定 offline，但不得伪装 ready。
- [真实能力目录当前不支持模型选择] → 本 change 只恢复 Adapter 已真实声明的能力，不伪造模型或 Skill 支持；模型目录扩展需独立 change。
- [Runtime 心跳递增 version 导致 Handler 重建] → Task Store 按 Agent 身份稳定复用，Handler/Card 更新不得清空 Task；用心跳穿插执行与完成后读取测试覆盖。
- [Desktop 重启时 MCP 恰好读取配置] → 配置保持原子替换；本次调用有界失败，下一次调用重新读取后恢复，不回退到旧令牌。
- [旧 socket close 晚于新 socket 建立] → close/error 处理只清理自己仍是当前 socket 的实例；显式 stop 使用运行代次阻止延迟重连。
- [heartbeat 与手动刷新竞争 version] → observation 前读取最新投影并对单次冲突有界重试；队列先吸收上一项失败再执行下一项。
- [Cloud 实例替换后 Account events socket 半开] → 服务端发送无业务数据 heartbeat，客户端存活期限到期后主动轮换 socket；旧连接事件按实例隔离。
- [恢复期间 Cloud 短暂不可用被误判为注销] → 仅明确 401/403 或 Account mismatch 清除既有凭据；其余失败保留凭据并关闭本机 session services。
- [生产 MySQL 拒绝 LIMIT prepared 参数] → 只内联经过服务端边界校验的整数 limit，其余动态值保持绑定，并用 SQL 形态测试锁定。
