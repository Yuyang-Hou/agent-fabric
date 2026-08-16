## ADDED Requirements

### Requirement: Google account login establishes Account membership
The product SHALL authenticate Humans through the supported Google OIDC flow, SHALL bind the authenticated Human to exactly one current Account in this phase, and MUST NOT accept user-supplied identity or Account identifiers as authority.

#### Scenario: First successful login
- **WHEN** a new Human completes Google OIDC with valid state, nonce and PKCE
- **THEN** the server creates the Human, creates an Account with that Human as owner, issues bounded device/session credentials and opens the signed-in product

#### Scenario: Invited member logs in
- **WHEN** a Human with a valid Account invitation completes Google OIDC
- **THEN** the server joins the verified Human to the invitation's exact Account and does not create a competing Account for that acceptance flow

#### Scenario: OIDC validation fails
- **WHEN** issuer, audience, state, nonce, PKCE, redirect, expiry or signature validation fails
- **THEN** no Human, Account membership or authenticated session is created and the UI provides a retryable error

### Requirement: Session recovery and logout are truthful
The Desktop SHALL restore a valid signed-in session across restart, SHALL expose explicit loading and expired states, and logout MUST revoke the local session and remove access to Account resources without deleting Agents or Runtimes.

#### Scenario: App restarts with valid session
- **WHEN** the Desktop restarts with an unexpired valid credential
- **THEN** it restores the same Human and Account before loading protected collections

#### Scenario: Session expires
- **WHEN** a protected query receives an authentication-expired result
- **THEN** the UI clears protected projections, returns to login and does not display cached Account data as current

#### Scenario: User logs out
- **WHEN** the user confirms logout
- **THEN** the device session is revoked and local secret material is cleared while Account resources remain intact

#### Scenario: User signs in again after logout
- **WHEN** the user starts Google login after logout while the system browser still has an authenticated Google session
- **THEN** the user explicitly selects a Google account before the product issues a new device session

### Requirement: Authentication secrets remain outside Renderer state
OAuth codes, refresh tokens, session tokens, PKCE values and provider credentials MUST remain in Main/secure storage or server trust boundaries and MUST NOT be returned through Renderer snapshots, logs or MCP results.

#### Scenario: Renderer snapshot is inspected
- **WHEN** any signed-in or error snapshot is serialized
- **THEN** it contains only allowlisted Human and Account display fields and no authentication secret or raw provider error
