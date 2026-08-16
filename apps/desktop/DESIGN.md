# Desktop interaction design

> Product authority: `replace-account-members-with-friends`

## Product model

Desktop serves one signed-in Human and that Human's personal Account. Primary navigation is exactly Agents, Runtimes and Friends. Friendship never changes Account ownership and never grants Agent or Runtime management authority.

## Friends

Friends is divided into three truthful collections:

- Active friends: display name, verified email summary, relationship time and remove action.
- Received invitations: inviter identity, creation/expiry and explicit accept/reject actions.
- Sent invitations: recipient email summary, creation/expiry/status and revoke action while pending.

Creating an invitation asks only for an email. There is no role selector, invitation token, Account chooser, resource transfer or chat action. Mutations disable duplicate submission, retain the last authoritative state on failure and offer bounded retry.

## Agents

Agents uses `mine`, `friends` and `archived` scopes:

- Mine shows Owner projections and supports create, edit, configure, archive and access changes.
- Friends shows only currently open Agents from active Human friends. Rows show safe public identity, owner summary, public capability summary and truthful availability.
- Archived shows only the current Human's archived Agents.

A friend-opened row opens a separate read-only summary. It never renders Runtime, model, Instructions, Skills, Activity, workload, secrets, private identifiers or management controls, and it disappears or closes with an access-lost state when Friendship/access changes.

Owner access control has only two values: “仅自己” (`private`) and “好友可访问” (`friends`). There is no Account-wide or selected-member target editor.

## Runtimes

Runtimes always belong to the current Human's personal Account and remain owner-only. Friendship does not affect Runtime list, binding, refresh, authentication guidance, configuration or deletion.

## Layout and states

The signed-in shell keeps compact grouped navigation and an inset content plane. All collections and mutations expose loading, empty, no-match, pending, stale, offline, access-lost, retryable error and success states from authoritative data. Keyboard operation, visible focus and primary actions remain usable at 414 px, 768 px and desktop widths without document-level horizontal scrolling.

## Explicit exclusions

Desktop does not provide Account switching, roles, members, public user search, App chat, Workspace, projects, task boards or friend-specific MCP management tools.
