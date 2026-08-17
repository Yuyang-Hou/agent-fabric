# Multica Agents clean-room capability map

> Research source: external read-only checkout `/Users/hyy/project/multica`
> Fixed commit: `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7`
> Product authority: `replace-account-members-with-friends`

This record converts observable product behavior into independent Agent Fabric requirements. The paths below are evidence locations only: no Multica source, assets, component names, CSS variables, copy or private routes may enter `apps/`, `packages/` or `adapters/`.

## Closed product surface

| Surface | Observable behavior to reproduce independently | Evidence |
| --- | --- | --- |
| Login | Focused sign-in state, pending and recoverable failure, session restoration, logout | `packages/views/auth/login-page.tsx` |
| App shell | Compact grouped navigation and inset content surface | `packages/views/layout/app-sidebar.tsx`, `apps/desktop/src/renderer/src/components/desktop-layout.tsx` |
| Agent catalog | Search; My/All/Archived scopes with unfiltered totals; availability/runtime/owner/model/access filters; stable sort; configurable columns; dense rows; loading/no-match/error states | `packages/views/agents/components/agents-page.tsx`, `agent-list-toolbar.tsx` |
| Catalog selection | Single and select-all behavior; archive/restore/access batch actions; permission-aware row menu and confirmation | `agent-batch-toolbar.tsx`, `agent-row-actions.tsx` |
| Create choice | Separate blank and AI-assisted entry modes, with clear back/continue hierarchy | `packages/views/agents/create/choose-create-method-page.tsx` |
| Manual create | Identity, runtime, instructions, model/thinking/tier/concurrency, access and capability inputs; validation and pending submit. Reference persistence behavior is research evidence only and is intentionally not adopted. | `manual-create-agent-page.tsx`, `agent-configuration-panel.tsx` |
| AI Builder | Runtime choice; conversation plus live structured preview; explicit final create. Reference durable-session behavior is intentionally replaced by a local ephemeral session. | `ai-create-agent-page.tsx`, `ai-builder-session-page.tsx`, `builder-conversation.tsx`, `builder-workspace.tsx` |
| Agent detail | Identity/status header, permission-aware actions, archived and runtime-required banners, loading/not-found/no-access/error states | `packages/views/agents/components/agent-detail-page.tsx` |
| Overview and activity | Overview summary; current presence; owner/runtime/access; execution/activity timeline and failure detail | `agent-overview-pane.tsx`, `agent-overview-summary.tsx`, `tabs/activity-tab.tsx` |
| Capabilities | Instructions; skills and runtime-skill disabling; runtime-supported MCP; Agent MCP; available integrations | `tabs/instructions-tab.tsx`, `tabs/skills-tab.tsx`, `tabs/mcp-config-tab.tsx`, `tabs/agent-mcp-tab.tsx`, `tabs/integrations-tab.tsx` |
| Settings | General profile/runtime/model/thinking/tier/concurrency; invocation access; secrets environment; custom args; provider runtime config; dirty-state navigation protection | `agent-detail-inspector.tsx`, `agent-access-settings.tsx`, `agent-overview-pane.tsx`, `tabs/env-tab.tsx`, `tabs/custom-args-tab.tsx`, `tabs/runtime-config-tab.tsx` |
| Runtime catalog | Runtime discovery/list, owner and provider identity, online/offline status, empty/loading/error states and connect/create actions | `packages/views/runtimes/components/runtimes-page.tsx`, `runtime-list.tsx` |
| Runtime detail | Provider/profile/status/visibility, rename/update/connect/delete and truthful capability/usage information | `runtime-detail-page.tsx`, `runtime-detail.tsx`, `runtime-settings-page.tsx` |
| Members | Member count/list; owner/admin/member roles; invitation create/pending/revoke; role change/remove; self and last-owner guards | `packages/views/settings/components/members-tab.tsx` |

## Agent Fabric semantic mapping

- Multica workspace scope maps to one authenticated `Account`; no workspace switcher or workspace object appears in product UI.
- Workspace-wide access maps to `account`; person-specific access maps to Account member targets.
- Multica chat, issues, squads, projects, task boards, inbox, automation and analytics remain out of scope.
- Agent Fabric creates its own API paths, component contracts, semantic tokens, layout dimensions and copy.
- Agent-side MCP/integration configuration belongs to Agent capabilities. The Codex-facing MCP is separate and only discovers/invokes accessible Agents over standard A2A.
- Runtime information must be truthful. Unsupported providers or controls are hidden/disabled rather than presented as functional.

## Independent route and API map

| Product flow | Agent Fabric route | Agent Fabric API/command boundary |
| --- | --- | --- |
| Login/session | `/login` | `/v1/session`, `/v1/auth/google/start`, `/v1/auth/google/callback`, `/v1/session/logout` |
| Agent catalog | `/agents?scope=mine\|all\|archived` | `GET /v1/accounts/{accountId}/agents` with bounded list projection and stable cursor |
| Create choice | `/agents/new` | Navigation only; starts no server resource |
| Manual/template create | `/agents/new/manual` | Local configuration and validation; one final `POST /v1/agents` |
| AI Builder | `/agents/new/ai` | Desktop/Edge invokes the selected local Runtime directly; one final `POST /v1/agents` only after local validation |
| Agent detail | `/agents/{agentId}/{overview\|activity\|capabilities\|settings}` | `GET/PATCH /v1/accounts/{accountId}/agents/{agentId}` and narrow capability/secret commands |
| Archive/restore/batch | Catalog/detail actions | Explicit archive/restore/batch commands with per-item authorization results |
| Runtime catalog/detail | `/runtimes`, `/runtimes/{runtimeId}` | `/v1/accounts/{accountId}/runtimes` and impact-planned mutation commands |
| Members/invitations | `/members` | `/v1/accounts/{accountId}/members` and `/member-invitations`; removal requires an impact-plan token |
| Codex MCP | No Desktop route | Local `list_agents`, `find_agent`, `ask_agent`, `get_task`; each call rechecks `canInvokeAgent` and uses standard A2A |

Renderer-to-host IPC mirrors these Account/resource IDs with strict query/mutation schemas. It never carries Cloud credentials, Runtime session IDs, cwd, secret values or model credentials.

## Required state matrix

Every implemented surface must account for: initial loading, refresh, empty data, no search/filter match, recoverable error, insufficient permission, offline Runtime, archived Agent, pending mutation, successful mutation and failed mutation. Narrow layouts switch between list and detail instead of compressing both.

## Explicit clean-room exclusions

- No import or package reference under the Multica namespace.
- No Multica brand, icon, wording, component/class name, CSS token, source comment, issue key or private route.
- No copied pixel geometry. Visual review compares hierarchy, density, action placement, state coverage and interaction steps.
- The fixed research checkout stays outside the Agent Fabric repository and production dependency graph.
