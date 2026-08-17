# Agent Fabric current architecture

> 当前产品权威：`openspec/changes/replace-account-members-with-friends`
> 外部 Agent 数据面：A2A v1.0.1 HTTP+JSON/REST

## 1. 当前产品

Agent Fabric 是一个个人多 Agent 管理与好友互联产品。每个 Human 通过 Google 登录进入自己唯一的个人 Account，在其中管理私有 Runtime 和多个 Agent；Human 之间通过无角色的邀请建立对称好友关系。Agent Owner 可将某个 Agent 设为仅自己或好友可访问。好友开放的 Agent 会以安全摘要出现在对方 Desktop Agent 管理和薄 MCP 中，并使用标准 A2A Message、Task 和 Artifact 完成问答。

Account 是个人资源和 Runtime 的租户隔离边界，不是好友关系或组织成员关系。产品没有 Account 切换、Workspace、项目、任务板、Inbox、通用聊天、自动化或统计大盘。当前领域模型不包含 AgentSpec、Revision、Deployment、发布、回滚或持久化 Agent Card；Agent 直接保存当前配置并绑定 Runtime，Agent Card 从当前可调用数据按需投影。

Multica 固定研究提交只用于 clean-room 功能、信息架构和交互对齐。产品不得复制或依赖 Multica 源码、资产、品牌、文案、Token、类名、组件 API、私有接口或像素几何。

## 2. 系统边界

```text
macOS Desktop
  ├─ Personal Account UI: Agents / Runtimes / Friends
  ├─ Google system-browser login + secure credential vault
  └─ local Account Host
       ├─ four-tool Codex MCP
       └─ Account Runtime registration

Codex MCP
  └─ list_agents / find_agent / ask_agent / get_task
       └─ shared A2A Client
            └─ Cloud Account Control Plane + A2A Router
                 └─ outbound Edge tunnel
                      └─ Runtime Adapter
                           └─ local Codex runtime
```

The Desktop Renderer is sandboxed and receives only validated Account product snapshots and commands. It never owns Cloud credentials, Runtime handles, local filesystem access or raw downstream errors.

## 3. Authority and data ownership

| State | Authority | Cloud exposure |
| --- | --- | --- |
| Human identity, personal Account ownership, friend invitations and Friendships | Cloud / MySQL | required control-plane state; no Account roles |
| Agent public identity, current editable configuration metadata and `private|friends` access | Cloud / MySQL | owner detail or distinct friend-safe projection |
| Runtime registration, health, capability summary and Agent binding | Cloud + Edge reconciliation | bounded public status only |
| MCP requester identity and invocation authorization | Account session + local Host | least-privilege scoped calls |
| A2A Task routing/state metadata | Cloud | bounded task metadata |
| Runtime session ID, cwd, model credential, environment values | Edge | never |
| environment values, MCP/integration credentials and private Runtime context | Edge | values never persist in Cloud; explicit replacement payloads transit Cloud to Edge |
| Agent Instructions and ordinary current configuration | Cloud / MySQL | required current Agent state; manager-only fields are access-controlled, not local-only |
| AI Builder input, conversation and preview | Desktop / Edge memory only | never enters Cloud; discarded on leave, close or restart |
| raw A2A Prompt, answer and Artifact bodies | Cloud transit + in-memory router / Edge | no default MySQL body persistence; operational retention still requires an operator policy |

Cloud does not run an Owner Agent and does not host model credentials. Edge only makes outbound authenticated connections; it does not expose the local Runtime directly to the public network.

## 4. Account control plane

The Control Plane owns Google identity, personal Account ownership, friend invitations, normalized Human Friendships, Agents, Runtimes, access modes, activities, short-lived self-test requesters and A2A routing authorization. MySQL is the commercial persistence path. Transitional owner membership rows may remain only as internal foreign-key compatibility and are not a product role model.

Agent management and Agent invocation are separate permissions. Only the owning Human manages an Agent or Runtime. Invocation admits the owner, or an active Human friend when the Agent is currently `friends`; Friendship grants no Account, Runtime, configuration, Activity, Skill or secret authority. Cross-Account not-found and denied responses are indistinguishable. Every Desktop/MCP discovery, send and Task read rechecks current Friendship and Agent access; friend removal, private toggle and archive take effect without reinstalling MCP.

Presence, working state, recent activity and Runtime health come from real Edge/Runtime/A2A events. UI and Cloud never infer online or success from intent alone.

## 5. Standard A2A data plane

All Agent invocation uses A2A v1.0.1. Current scope supports text input/output, Message send, Task read and text Artifact projection. Task, Context, Message and Artifact IDs follow standard semantics; Runtime session IDs never become protocol identifiers.

The four-tool MCP is a local convenience adapter, not another Agent protocol:

- `list_agents`: list only currently invokable Agents.
- `find_agent`: exact/bounded lookup using the same invocation policy.
- `ask_agent`: send a standard A2A Message and return the Task state/result.
- `get_task`: reread only a Task originated by the current Principal while access remains valid.

MCP cannot log in, manage friendships, edit Agents, manage Runtimes, change access, read secrets or impersonate another Principal.

## 6. Edge and Runtime Adapter

The Account Edge Host registers one Runtime with truthful detection and health, reconciles Account Agent bindings, receives authorized A2A work over an outbound tunnel and isolates execution by target Agent. Codex ACP is the first real Adapter; domain contracts remain Runtime-neutral and are tested with a Fake Runtime.

Private Agent configuration is encrypted locally. The current Runtime Adapter accepts normalized execution requests, emits normalized progress/completion/failure events, supports cancellation and exposes no provider session handle outside Edge.

Default policy fails closed for unsupported capabilities, missing authentication, stale binding, cross-Agent session reuse, cancellation races, side effects and sensitive-data projection.

## 7. Desktop product architecture

The signed-out surface is Google login. The signed-in shell has exactly Agents, Runtimes and Friends. Friends separates active friends, received invitations and sent invitations. Agents separates owned, friend-opened and archived scopes; friend rows and detail use a read-only safe projection with no management actions. Collection, creation, detail, settings, impact dialogs and state notices use Agent Fabric-owned components and semantic tokens.

Every asynchronous surface provides loading, empty, no-match, stale, recoverable error, permission and offline behavior. Destructive changes fetch real impact and use concurrency tokens. Unsupported Runtime capabilities are absent or explicitly unavailable. Narrow layouts keep key actions operable without document-level horizontal overflow.

## 8. Security and observability

- Default deny network, write and side effects unless a current product contract explicitly allows them.
- Secrets are write-only and encrypted at rest on the device where applicable.
- Logs and evidence exclude Prompt/answer bodies, tokens, OAuth data, Runtime IDs, absolute paths, private configuration and raw errors.
- Automated scenarios cover identity, cross-Account isolation, authorization, removal/revocation, offline behavior, cancellation, concurrency, multi-Agent session isolation and leakage.
- A2A types are generated from or validated against the fixed official specification rather than maintained as drifting handwritten copies.

## 9. Build and release authority

Current build, typecheck, lint, tests, SBOM and packaged artifacts include only the Account Agents product and reusable A2A/Runtime/security primitives. Historical Personal Agent, Messenger/Matrix, Atlas/ContextCapsule and AgentSpec/Revision/Deployment code cannot be reachable from a current executable.

Release acceptance verifies the final `.app` and DMG: strict code signing, Bundle ID, Developer ID authority, Hardened Runtime, notarization acceptance, stapled ticket, Gatekeeper, quarantine-tagged first launch, packaged resource manifest and current Renderer. Build success alone is not release evidence.

User-visible changes are recorded through `changelog/unreleased/`; GitHub Release remains draft until the verified artifact is attached and checked.

## 10. Historical and future research

Historical OpenSpec changes are isolated from current authority. Dedicated Messenger/Matrix, legacy Agent-pair “Friends”, Atlas/ContextCapsule, AgentSpec/Revision/Deployment, Colleague Mesh and broader platform source or design trees remain historical only. The current Human Friendship is a new normalized Human-to-Human authorization relation and MUST NOT reactivate legacy friend-specific MCP tools, message stores or Agent-pair schemas. `docs/history/README.md` is the audit index; full content remains recoverable from Git history.

Any future reintroduction requires an explicit user-approved OpenSpec change and cannot silently reuse a historical compatibility flag or executable.
