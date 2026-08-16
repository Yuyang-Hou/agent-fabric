## ADDED Requirements

### Requirement: Verified Humans receive role-free friend invitations
An authenticated Human SHALL create a bounded expiring friend invitation for one normalized email without assigning an Account role, sharing an invitation secret or adding the recipient to the inviter's Account. The intended Human MUST see the invitation in their incoming inbox only after Google OIDC verifies the matching identity.

#### Scenario: Existing user receives an invitation
- **WHEN** an authenticated Human invites another registered Human's verified email
- **THEN** the inviter sees one pending outgoing record and the intended recipient sees one pending incoming record with inviter identity, creation time and expiry

#### Scenario: Unregistered recipient signs in later
- **WHEN** an invitation targets an email that has no Human Principal and that email later completes valid Google OIDC
- **THEN** the product creates or restores the recipient's own personal Account and then shows the pending invitation without joining the inviter's Account

#### Scenario: Unrelated user lists invitations
- **WHEN** another authenticated Human whose verified identity does not match the invitation queries incoming invitations or guesses its ID
- **THEN** the server returns no invitation detail and a generic not-found/denied result

#### Scenario: Self or duplicate invitation is attempted
- **WHEN** the inviter targets their own verified identity or an active friendship/pending pair already exists
- **THEN** no duplicate relationship is created and the response does not reveal unrelated account data

### Requirement: Invitation acceptance is an explicit Human state transition
Only the intended authenticated Human SHALL accept or reject a pending friend invitation; only the inviter SHALL revoke it. Acceptance MUST atomically create or restore one active normalized Human Friendship and mark the invitation accepted, while reject, revoke and expiry MUST create no active Friendship.

#### Scenario: Recipient accepts
- **WHEN** the exact recipient clicks accept on a valid pending invitation
- **THEN** one active bidirectional Friendship is committed atomically, both users see each other as friends and neither Account ownership nor resource authority changes

#### Scenario: Recipient rejects
- **WHEN** the exact recipient clicks reject
- **THEN** the invitation becomes rejected, no Friendship exists and the inviter sees the terminal status

#### Scenario: Inviter revokes
- **WHEN** the inviter revokes a still-pending outgoing invitation
- **THEN** the invitation becomes revoked and the recipient can no longer accept it

#### Scenario: Invitation is stale or concurrently consumed
- **WHEN** an expired, rejected, revoked, accepted or concurrently consumed invitation is accepted
- **THEN** no additional Friendship or Account mutation occurs and the caller receives a bounded non-leaking state error

### Requirement: Friendship is symmetric and revocation removes future Agent access
An active Friendship SHALL be a unique symmetric relationship between two Human Principals. Either Human SHALL remove it without transferring or deleting either user's Account, Agent, Runtime, Skill, draft or configuration; removal MUST deny future friend-derived Agent discovery, invocation and Task reads.

#### Scenario: Either friend removes the relationship
- **WHEN** either Human confirms friend removal
- **THEN** the Friendship becomes revoked for both users, shared Agent rows disappear and subsequent friend-authorized A2A delivery is denied before Runtime execution

#### Scenario: Old identifiers are reused
- **WHEN** a removed friend uses a cached Agent ID, Task ID or old device credential
- **THEN** current authorization returns generic denial and exposes no current Agent, Task or Friendship metadata

#### Scenario: Friends reconnect later
- **WHEN** the same pair completes a new valid invitation and explicit acceptance after revocation
- **THEN** a new active relationship version is established without restoring prior Agent access decisions, cached Tasks or private context

### Requirement: Friends UI exposes truthful inbox and relationship states
The Friends surface SHALL show active friends, incoming invitations and outgoing invitations with loading, empty, pending, accepted, rejected, revoked, expired, error and retry states. It MUST NOT provide Account roles, member administration, resource transfer, public user search, invitation-token input or App messaging controls.

#### Scenario: User opens Friends
- **WHEN** authenticated friendship data loads
- **THEN** active friends and incoming/outgoing invitation records appear in distinct understandable sections with only valid actions for each state

#### Scenario: Mutation is pending or fails
- **WHEN** invite, accept, reject, revoke or remove is in flight or rejected
- **THEN** duplicate action is disabled, the prior server state remains visible, and the UI offers a bounded retry without optimistic relationship creation
