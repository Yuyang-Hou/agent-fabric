## ADDED Requirements

### Requirement: Account members have explicit roles
An Account SHALL maintain active members with roles `owner`, `admin` or `member`; exactly one or more owners MUST remain, and authorization MUST be scoped by `accountId` on every member operation.

#### Scenario: Owner lists members
- **WHEN** an Account owner opens Members
- **THEN** the product returns only that Account's members, roles and non-secret identity summaries

#### Scenario: Cross-Account member access is attempted
- **WHEN** a Principal requests or mutates membership in another Account
- **THEN** the server returns a generic denial without revealing the other Account's membership

### Requirement: Owners and admins can invite members
Owners and admins SHALL create bounded, expiring, single-use Account invitations with an assigned role no higher than the inviter may grant; invitation secrets MUST be shown only at creation and acceptance boundaries.

#### Scenario: Invitation is accepted
- **WHEN** the intended Human authenticates and consumes a valid unused invitation
- **THEN** one active Account membership is created atomically and the invitation becomes unusable

#### Scenario: Invitation is invalid
- **WHEN** an invitation is expired, revoked, already consumed, for another Account context or altered
- **THEN** membership is not created and the response does not expose whether an unrelated Human or Account exists

#### Scenario: Ordinary member invites
- **WHEN** a `member` attempts to create an invitation
- **THEN** the server denies the operation and creates no invitation

### Requirement: Role changes and member removal preserve ownership invariants
Owners/admins SHALL change allowed roles and remove members only after resolving resources owned by that member; the system MUST NOT leave an active Agent or Runtime without a valid owner.

#### Scenario: Member owns resources
- **WHEN** an administrator requests removal of a member who owns Agents or Runtimes
- **THEN** the server returns an impact plan and requires explicit transfer, Agent archive or Runtime unbind choices before removal can commit

#### Scenario: Removal commits
- **WHEN** every owned resource has a valid disposition and removal is confirmed
- **THEN** one transaction removes membership, deletes member invocation targets and subscriptions, revokes credentials/invitations and prevents future Agent invocation

#### Scenario: Last owner would be removed
- **WHEN** an operation would leave the Account without an owner
- **THEN** the server rejects it without changing membership or resources

### Requirement: Members UI supports complete management states
The Members surface SHALL provide member search/list, pending invitations, invite creation, role editing, removal impact/confirmation, loading, empty, forbidden, expired and error states with keyboard-operable controls.

#### Scenario: Removal fails after confirmation
- **WHEN** the server rejects a stale impact plan or concurrent ownership change
- **THEN** the dialog remains recoverable, refreshes the impact and does not optimistically remove the row
