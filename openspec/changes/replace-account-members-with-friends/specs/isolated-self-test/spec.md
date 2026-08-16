## MODIFIED Requirements

### Requirement: Owner can run an isolated real-path self-test
The CLI SHALL provide a human-confirmed self-test for an existing Agent owned by the current Human and MUST verify truthful Presence, owner invocation access, MCP discovery, one real standard A2A Message result, temporary requester cleanup and post-revocation denial. The automated self-test MUST NOT fabricate or replace the separate two-Human Friendship acceptance.

#### Scenario: Personal Account owner completes the loop
- **WHEN** an authenticated owner runs `agent-fabric self-test --agent <Agent ID> --confirm` for an owned online Agent
- **THEN** the Server creates a distinct short-lived requester Device Credential bound to that exact personal Account and Agent and the CLI completes all stages without another Human login or Friendship authority

#### Scenario: Friend Agent is selected
- **WHEN** the owner self-test is pointed at an Agent owned by another Human
- **THEN** the CLI rejects the target as unsupported for isolated owner self-test and creates no temporary access or A2A Task

#### Scenario: Agent returns a real answer
- **WHEN** the isolated requester discovers the selected owned Agent and sends the self-test A2A Message
- **THEN** the returned standard Task is completed with a non-empty text Artifact and the report records only its character count and duration

#### Scenario: Agent is unavailable
- **WHEN** the selected Agent is archived, unbound, offline or unauthorized before the send
- **THEN** the CLI fails with a stable preflight error and creates no A2A Task

## ADDED Requirements

### Requirement: Release acceptance proves the real two-Human friend path
Release acceptance SHALL use two distinct verified Humans with separate personal Accounts and isolated device credentials to prove invitation inbox, explicit acceptance, friend Agent App visibility, MCP/A2A invocation and immediate revocation. Fixtures, owner self-test and one-device credential substitution MUST NOT satisfy this requirement.

#### Scenario: Two Humans complete friend access
- **WHEN** Human A invites Human B, B accepts, A opens one online Agent to friends and B refreshes Desktop and Codex MCP
- **THEN** B sees the Agent's bounded App summary, discovers it through MCP and receives one real standard A2A text result without Account or Runtime management access

#### Scenario: Revocation is proven
- **WHEN** either Human removes the Friendship after a completed Task
- **THEN** B no longer sees or discovers A's Agent, a new ask is rejected before Runtime execution and the prior Task body cannot be reread
