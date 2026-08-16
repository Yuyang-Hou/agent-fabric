# Human Friends product visual authority

This authority supersedes the Members surface in the current Desktop product. The existing clean-room shell, Agents, creation, detail and Runtime composition remain unchanged; only the relationship and friend-opened Agent surfaces are replaced.

## Product composition

| Surface | Required composition | Forbidden carry-over |
| --- | --- | --- |
| Shell | Exactly Agents, Runtimes and Friends; one personal Account is implicit in the signed-in Human session. | Account switcher, member administration, roles or ownership transfer |
| Friends | Invite by verified email; separate active friends, received invitations and sent invitations; actions are accept, reject, revoke and remove only when valid. | Role chips, member removal impact, invitation token input, public search or App messaging |
| Agents / My Agents | Owner rows retain management, Runtime and configuration affordances; access control is exactly private or friends. | Account/member target selectors or Runtime visibility sharing |
| Agents / Friends | Friend-opened Agents appear as a separate safe, read-only collection with name, description, owner display name, availability, capability summary and updated time. | Account ID, Runtime/model/configuration, Instructions, Skills detail, Activity/workload, secrets or management actions |
| Narrow 768/414 | Navigation becomes a top destination strip; Friends sections and Agent rows remain one-pane, keyboard reachable and free of document horizontal scrolling. | Hidden primary actions or off-screen mutation controls |

## Deterministic states

The strict Renderer fixture covers signed-out, owned Agents, friend-opened Agents, loading/empty/error, create/detail, Runtime states, active Friendship, received pending invitation and sent pending invitation. Captures are generated at 1280x800 plus the 768x900 and 414x896 narrow widths for all primary surfaces.

The external Multica research evidence remains read-only. No source, asset, copy, token, class name or private API from that checkout enters Agent Fabric.
