## ADDED Requirements

### Requirement: Owner-generated invitation establishes Agent discovery consent
An authenticated Agent Owner SHALL be able to generate a short-lived, single-use invitation bound to the Owner's Personal Agent, and the system MUST require another authenticated Owner to consume that invitation before creating a Friendship.

#### Scenario: Valid invitation is consumed
- **WHEN** another authenticated Owner consumes a valid unexpired invitation for a different Personal Agent
- **THEN** the system SHALL atomically create one active bidirectional Friendship for the exact Agent pair and invalidate the invitation

#### Scenario: Invalid invitation is consumed
- **WHEN** an invitation is expired, already consumed, malformed, revoked, self-targeted, or bound to a different Agent
- **THEN** the system MUST reject it and MUST NOT create or modify any Friendship

#### Scenario: Same Agent pair is added again
- **WHEN** the exact Agent pair already has an active Friendship
- **THEN** the operation SHALL be idempotent and MUST NOT create duplicate relationships or duplicate message authority

### Requirement: Friendship is the only cross-Agent normal-message authority
The Cloud Gateway and target Edge MUST both require an active exact-pair Friendship before accepting a normal Message between different Personal Agents. The only exception SHALL be the explicitly authenticated self-test route whose source, target, and healthy current Deployment all belong to the same Personal Agent.

#### Scenario: Active friends exchange a Message
- **WHEN** an authenticated source Agent sends a text Message to its active friend
- **THEN** the Gateway and target Edge SHALL authorize the exact source and target pair before delivery

#### Scenario: Non-friend attempts delivery
- **WHEN** an Agent sends to an Agent with no active exact-pair Friendship
- **THEN** the Gateway MUST reject delivery without revealing private target details or creating a target Runtime Session

#### Scenario: Current Agent sends to its self-test target
- **WHEN** the authenticated source Agent sends to the same stable Agent ID and its current Revision and Deployment are healthy
- **THEN** the Gateway and target Edge SHALL authorize only that exact self route without creating or requiring a Friendship

#### Scenario: Self-test identity does not match
- **WHEN** source, target, current Deployment Agent, or authenticated local Agent identity differs
- **THEN** the system MUST reject the self-test route and MUST NOT widen access to another Agent

### Requirement: Either Owner can revoke future friendship access
Either authenticated Owner SHALL be able to delete the Agent friend, which SHALL revoke the Friendship for future messages without claiming to erase content already stored on either device.

#### Scenario: Friendship is removed
- **WHEN** either Owner removes the friend in the App
- **THEN** the Friendship SHALL become revoked, both sides SHALL stop showing it as active, and every future Message SHALL be rejected by Cloud and Edge

#### Scenario: Message races with revocation
- **WHEN** revocation occurs before the target Edge starts processing a received Message
- **THEN** the Edge MUST reject the Message and MUST NOT start or resume a Runtime Session for it

### Requirement: Friend list exposes only minimal public state
The App and MCP SHALL list only active friend Agent IDs, public Agent Card summaries, and truthful online/offline Presence, and MUST NOT expose the friend's Device ID, Runtime provider details, paths, credentials, Runtime Session IDs, or private capabilities.

#### Scenario: Friend is online
- **WHEN** the friend's Host connection is fresh, Revision matches, and Runtime is healthy
- **THEN** the friend list SHALL display online

#### Scenario: Presence is uncertain or stale
- **WHEN** any required Presence signal is missing, stale, mismatched, or unhealthy
- **THEN** the friend list MUST display offline and MUST NOT display a guessed last-seen value

### Requirement: Public Agent search is absent from P0
The product MUST NOT provide unauthenticated or public directory search for Personal Agents in P0.

#### Scenario: User attempts discovery without an invitation
- **WHEN** a user attempts to enumerate or search Personal Agents without an active Friendship or valid invitation
- **THEN** the system MUST reject the request without returning Agent records

### Requirement: Friendship management exposes consent and revocation consequences
The desktop App SHALL distinguish creating an invitation, consuming another Owner's invitation, viewing active friends, and removing a friend, and SHALL present truthful expiry, Presence, pending-operation, empty, and failure states without implying public discovery.

#### Scenario: Owner has no Agent friends
- **WHEN** the authenticated Agent has no active Friendship
- **THEN** the App SHALL keep the self-test contact visible, SHALL show a real-friends empty state that offers invitation creation or invitation consumption, and MUST NOT show fabricated suggested Agents

#### Scenario: Owner removes a friend
- **WHEN** the Owner initiates friend removal
- **THEN** the App SHALL require explicit destructive confirmation that future messaging stops, and SHALL keep the existing friend visible until revocation succeeds

#### Scenario: Invitation operation fails
- **WHEN** invitation creation or consumption fails, expires, or is rejected
- **THEN** the App SHALL preserve the last verified friend list, SHALL identify the failed operation, and MUST NOT display a new Friendship optimistically

### Requirement: Current Agent is exposed as a non-friend self-test contact
The App and MCP SHALL expose the current published Personal Agent once as “我的 Agent · 自测” with `contactType: self`, no `friendshipId`, and truthful Presence, and MUST NOT persist or present that projection as an active Friendship.

#### Scenario: Owner has no real Agent friends
- **WHEN** the current Personal Agent is published but has no active Friendship
- **THEN** the App SHALL show the self-test contact first and SHALL still offer invitation creation and consumption for adding real Agent friends

#### Scenario: Owner interacts with the self-test contact
- **WHEN** the Owner views the self-test contact
- **THEN** the App SHALL identify it as a single-account message-path test and MUST NOT offer invitation, removal, or revocation controls for it

#### Scenario: Real friend projection is returned
- **WHEN** an active Friendship is listed
- **THEN** its contact SHALL use `contactType: friend`, SHALL include its real `friendshipId`, and SHALL retain normal removal and revocation behavior
