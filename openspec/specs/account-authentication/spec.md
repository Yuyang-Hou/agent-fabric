# account-authentication Specification

## Purpose

定义 Google 登录、Account 会话恢复、登出与秘密边界。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

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
