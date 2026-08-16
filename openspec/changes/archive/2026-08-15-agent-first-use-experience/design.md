## Context

The current Desktop hydrates Account administration data and always enters the `agents` catalog. The shared client already exposes `listInvokableAgents`, `askAccountAgent` and `getAccountAgentTask`, but the Account Product Host/IPC and Renderer do not expose them. A user therefore cannot obtain an Agent result from the product without installing and understanding Codex MCP.

The new experience must make Agent use primary without turning the product into a generic chat system. It must reuse current Account authorization and A2A v1.0.1, preserve Edge execution, avoid new Cloud persistence of raw request/result bodies and keep all Renderer inputs strict and redacted.

## Goals / Non-Goals

**Goals:**

- Make a focused Agent-use surface the default signed-in destination.
- Let a user understand, choose and invoke a currently accessible Agent from the Desktop.
- Represent work as a standard A2A Task with truthful lifecycle, cancellation, input-required and result states.
- Preserve one authorization policy and one execution path across Desktop and Codex MCP.
- Keep recent content encrypted on the requester's Mac, bounded and user-clearable.
- Provide an honest activation or human-handoff path when the Agent loop cannot complete.

**Non-Goals:**

- General or social chat, rooms, an Inbox, cross-Agent conversations or a task board.
- Automatic semantic routing or sending a draft request to Cloud before the user chooses an Agent.
- Background autonomy, scheduled work, workflow composition or side-effect approval expansion.
- A new A2A binding, private protocol fields or Cloud-hosted Runtime/model credentials.
- Default Cloud history for request, answer or Artifact bodies.
- Claiming that an Agent replaces human judgment or responsibility.

## Decisions

### 1. Add `use-agents` as the default signed-in route

The signed-in shell will order destinations as Use Agents, Agents, Runtimes and Members. Login restoration and ordinary navigation land on Use Agents. Management surfaces remain intact and Agent rows/details gain a visible Use action.

The route is task-focused: accessible Agent chooser, bounded request composer and one active-result plane. It is not a chronological chat room. This makes the intended value loop obvious without introducing message/social domain models.

Alternative considered: keep Agents as the default and add a small Ask button. Rejected because administration would still define the first impression and first-use path.

### 2. Require explicit target confirmation

The Host loads an invokable-Agent projection containing stable Agent ID, name, description, owner display summary, access reason, public capability labels and truthful availability. Search and filtering use only this allowlisted projection. A typed request is held locally and is not used as a Cloud search query.

The user must select and confirm one Agent before send. Offline, unstable, unbound, archived or newly revoked targets cannot be silently substituted. The UI can suggest recently used or currently online Agents using local history and the current projection, but cannot auto-send or invent capability confidence.

Alternative considered: send the request to a routing Agent that chooses a target. Rejected because no such governed routing capability exists and it would expose content before informed target selection.

### 3. Reuse the exact standard A2A path

Desktop Host commands call the shared client, which resolves the current dynamic Agent Card and uses A2A Message, Task, Context and Artifact structures. The Control Plane rechecks current Account invocation access on discovery, send and every Task read. Edge execution and Runtime session isolation remain unchanged.

The client projection will retain `contextId`, allowlisted status text and text Artifact output. Follow-up for `input-required` uses a standard A2A Message tied to the existing Task/Context and `referenceTaskIds`; no private continuation field is added. If the target/runtime cannot continue the Task, the UI preserves the prior local record and offers a new request or human handoff rather than pretending the work resumed.

Cancellation uses the standard A2A cancel operation and reports the returned TaskState. Closing the App or navigating away does not imply cancellation.

### 4. Use idempotent Host commands and truthful recovery

Every send carries a locally generated stable idempotency/message ID. While a send is unresolved, duplicate UI submission is disabled. A retry reuses the same ID until Cloud proves a Task ID or an allowlisted terminal error.

The Host polls with a bounded foreground wait, then stores the Task receipt locally and continues bounded refresh while the use surface is open. On restart, non-terminal local receipts are re-read through `get_task`. If Cloud no longer has the in-memory body, access was revoked or the Task cannot be recovered, the state becomes `result-unavailable`; it never becomes completed or failed by inference.

Alternative considered: add Cloud body persistence to make restart recovery easy. Rejected because this change does not justify expanding the current data boundary.

### 5. Store bounded recent content locally and encrypted

A Host-owned recent-use store persists at most 100 entries per local Account/user identity and removes entries older than 30 days when opened or written. Each record contains the selected Agent summary, request text, allowlisted Task/Context identifiers, latest standard state, text result/status, timestamps and idempotency key. It contains no credential, Runtime session ID, cwd, private Agent Instructions or raw internal error.

Records are serialized and encrypted with Electron `safeStorage`, written under the App data directory with `0700` directory and `0600` file modes, and scoped by hashed Account/user identity. The Renderer receives only the currently authenticated user's validated projection. Users can remove one entry or clear all local recent content. Uninstall, OS backup and device-disposal behavior must be disclosed rather than described as remote deletion.

Alternative considered: keep content only in memory. Rejected because ordinary restart would make a task-focused product feel unreliable. Alternative considered: Cloud synchronization. Rejected because it expands retention, deletion and legal scope before those policies exist.

### 6. Make failure and escalation first-class

The result plane distinguishes submitted, working, input-required, completed, failed, cancelled, rejected, offline and result-unavailable. It shows only allowlisted human-readable recovery actions. Raw downstream errors never reach Renderer or local history.

When input or approval is required, the UI identifies the bounded need and offers standard continuation only when supported. When the Agent lacks permission, context or capability, the product offers retry, choose another Agent, copy a bounded handoff summary or contact the Agent owner. “Contact owner” is guidance and identity display, not a new messaging system.

### 7. Treat activation as part of the product loop

If no Agent is invokable, the empty state is derived from current role and Account resources:

- a user who can create is led to create an Agent;
- an owned unbound Agent leads to Runtime setup/rebind;
- a member without invocation access is told to request access from an Account owner/admin;
- connection or authentication failure is shown separately from a genuinely empty Account.

The product never fabricates a demo result in the signed-in real surface.

### 8. Keep observability metadata-only

New operational events may include route, Agent ID, Task state, latency bucket, retry count and stable allowlisted error category. They must exclude request/result/status text, local history content, Agent Instructions, tokens, Runtime identifiers, absolute paths and raw errors. Production log and backup retention must still be verified separately before public privacy claims.

## Risks / Trade-offs

- [The surface looks like chat and expands uncontrollably] → Keep one selected Agent, one request/task result plane and no room/contact/message-history domain.
- [Server restart loses the in-memory A2A body] → Recover by standard Task read when possible and otherwise show `result-unavailable`; do not infer success or add body persistence implicitly.
- [Local history is mistaken for remotely deletable data] → Scope and encrypt it locally, provide clear actions and disclose backup/uninstall limitations.
- [Agent metadata overstates capability] → Show owner-authored descriptions and allowlisted capability labels as descriptions, not guarantees; availability and access are live facts.
- [Request is sent twice during uncertain network state] → Reuse the same idempotency/message ID until a Task receipt or terminal denial is known.
- [Input-required continuation differs across Runtime adapters] → Use only standard A2A Task/Context semantics and gate continuation on actual support; otherwise preserve state and offer a new request/handoff.
- [Making Use Agents default hides administration] → Keep Agents, Runtimes and Members as stable primary destinations and add activation links from the use surface.
- [A shared Agent exposes content to its owner/runtime] → Show the selected owner and execution boundary before send; public privacy copy must state that authorized request/result content crosses that boundary.

## Migration Plan

1. Add domain schemas, local encrypted-store contract and client methods behind a disabled product-surface flag.
2. Add Host/IPC task commands and tests against Fake A2A/Runtime paths without changing the default route.
3. Build and visually accept the Use Agents surface, activation states and Agent-entry actions against real APIs.
4. Run access, revocation, cancellation, input-required, restart, local-clear and leakage acceptance.
5. Switch signed-in default navigation to `use-agents`, update product authority/docs and remove the temporary flag.
6. Rebuild the signed/notarized macOS artifact and rerun quarantine first-launch acceptance through one real Agent result.

Rollback restores Agents as the default route and removes the Use Agents navigation while leaving encrypted local records untouched but inaccessible to older code. A later compatible build may recover or explicitly clear them; rollback must not silently upload or reinterpret their contents.

## Open Questions

None required before implementation. Public retention, operator, subprocessor and legal-policy decisions remain release blockers outside this behavior change.
