## Why

The current Account Agents product makes creation and administration complete, but a user still has to leave the Desktop and understand Codex MCP before obtaining an Agent result. That contradicts the working product thesis: make Agents the first place people go for knowledge and work.

## What Changes

- Add a focused signed-in Agent-use destination as the default route, ahead of administration surfaces.
- Let a user browse, search and explicitly choose any currently invokable Agent, then submit one text request without understanding MCP, A2A or Runtime architecture.
- Show ownership, capability, access reason and truthful availability before send; never recommend or enable an Agent that the current Principal cannot invoke.
- Run every Desktop request through the same standard A2A Message/Task/Artifact path and authorization checks already used by Codex MCP.
- Present submitted, working, input-required, completed, failed, cancelled and access-revoked states as a task-focused result experience rather than a generic chat transcript.
- Keep recent request/result content local to the requester's Mac with an explicit clear action; Cloud retains only the existing bounded routing/activity metadata by default.
- Provide activation guidance when no Agent is invokable, while keeping Agents, Runtimes and Members as supporting management destinations.
- Add clear human-handoff guidance when an Agent lacks access, context or capability; do not frame people as obsolete.
- **BREAKING**: signed-in Desktop navigation and first-run behavior no longer open on the Agent administration catalog by default.

Explicit non-goals: a general-purpose chat client, cross-Agent group chat, autonomous routing without user confirmation, task boards, workflow automation, human replacement, Cloud-hosted models or Runtime credentials, new A2A protocol extensions, and default Cloud persistence of raw request/result bodies.

## Capabilities

### New Capabilities

- `agent-first-use`: A focused Desktop path for finding an invokable Agent, sending a standard A2A request, following truthful Task state, receiving a result and handling escalation with local-only recent content.

### Modified Capabilities

None. The current main-spec capability remains unchanged; this change extends the active Account Agents product defined by `multica-aligned-agents-product`.

## Impact

- Product UI: adds the default signed-in use destination, Agent chooser, request composer, Task/result states, local history controls and supporting catalog/detail entry actions.
- Desktop Host/IPC: adds strict commands and redacted snapshots for A2A send, read, cancel, input-required continuation and local recent-content storage.
- Control Plane: reuses current Account authorization, dynamic Agent Card, A2A router and bounded task/activity persistence; no new raw-body Cloud table is introduced.
- Edge Host and Runtime Adapter: reuse the current target-Agent execution and cancellation contracts; no inbound Edge service or provider-specific product model is added.
- A2A: continues to use A2A v1.0.1 Message, Task and Artifact semantics without a private protocol extension.
- Privacy and trust: request text stays local until the user confirms a target Agent; recent content is requester-local and clearable; production logs and backups still require release-policy verification.
