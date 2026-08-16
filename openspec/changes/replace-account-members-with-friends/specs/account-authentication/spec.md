## MODIFIED Requirements

### Requirement: Google account login establishes a personal Account
The product SHALL authenticate Humans through the supported Google OIDC flow, SHALL bind each authenticated Human to exactly one personal Account in this phase, and MUST NOT accept user-supplied identity or Account identifiers as authority. Friend invitations MUST NOT switch the active Account or create membership in another Human's Account.

#### Scenario: First successful login
- **WHEN** a new Human completes Google OIDC with valid state, nonce and PKCE
- **THEN** the server creates the Human, creates one personal Account owned only by that Human, issues bounded device/session credentials and opens the signed-in product

#### Scenario: Invited friend logs in
- **WHEN** a Human with one or more pending friend invitations completes Google OIDC
- **THEN** the server restores or creates that Human's own personal Account, opens the product and exposes only invitations matching the verified identity for explicit acceptance

#### Scenario: Existing friend signs in
- **WHEN** a Human with active Friendships signs in on another device
- **THEN** the same personal Account is restored and current friend/open-Agent projections are rebuilt without copying another Human's Account authority

#### Scenario: OIDC validation fails
- **WHEN** issuer, audience, state, nonce, PKCE, redirect, expiry or signature validation fails
- **THEN** no Human, personal Account, Friendship or authenticated session is created and the UI provides a retryable error
