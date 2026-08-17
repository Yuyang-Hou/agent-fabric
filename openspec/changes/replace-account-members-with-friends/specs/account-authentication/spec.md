## MODIFIED Requirements

### Requirement: Google account login establishes a personal Account
The product SHALL authenticate Humans through Google OIDC or a one-time code sent to a verified ordinary email address, SHALL bind both methods for the same verified email to exactly one Human and one personal Account, and MUST NOT accept user-supplied identity or Account identifiers as authority. Friend invitations MUST NOT switch the active Account or create membership in another Human's Account.

#### Scenario: First successful email-code login
- **WHEN** a new Human requests a code, receives the six-digit value and submits it within five minutes and three attempts
- **THEN** the server atomically consumes the code, creates one Human and one personal Account owned only by that Human, issues bounded device credentials and opens the signed-in product

#### Scenario: First successful Google login
- **WHEN** a new Human completes Google OIDC with valid issuer, audience, state, nonce, PKCE, redirect, expiry and signature
- **THEN** the server creates one Human and one personal Account owned only by that Human, issues bounded device credentials and opens the signed-in product

#### Scenario: The same verified email uses both methods
- **WHEN** a Human first authenticates with one supported method and later authenticates with the other method using the same verified email
- **THEN** Better Auth resolves one authentication user and the server restores the same Human and personal Account without creating, merging or transferring a second Human

#### Scenario: Invited friend logs in
- **WHEN** a Human with one or more pending friend invitations completes either supported login method
- **THEN** the server restores or creates that Human's own personal Account, opens the product and exposes only invitations matching the verified identity for explicit acceptance

#### Scenario: Existing friend signs in
- **WHEN** a Human with active Friendships signs in on another device through either supported method
- **THEN** the same personal Account is restored and current friend/open-Agent projections are rebuilt without copying another Human's Account authority

#### Scenario: Email code is invalid, expired, exhausted or replayed
- **WHEN** a submitted code is wrong, older than five minutes, beyond three attempts, already consumed or concurrently consumed
- **THEN** no Human, personal Account, Friendship or authenticated session is created, the response does not reveal registration state, and the UI provides a bounded retry path

#### Scenario: OIDC validation fails
- **WHEN** issuer, audience, state, nonce, PKCE, redirect, expiry or signature validation fails
- **THEN** no Human, personal Account, Friendship or authenticated session is created and the UI provides a retryable error

#### Scenario: Account-linking identity conflicts
- **WHEN** a provider proposes an unverified email, a different email, or a link that would join two authentication users
- **THEN** the login fails closed, no Human records are merged, and only a redacted security event is recorded

### Requirement: Session recovery and logout are truthful
The Desktop SHALL restore a valid signed-in session across restart, SHALL expose explicit loading and expired states, SHALL fall back to a supported login method when no valid session exists, and logout MUST revoke local credentials and remove access to Account resources without deleting Agents or Runtimes.

#### Scenario: Valid device credential is restored
- **WHEN** the App starts with a valid scoped credential in the OS credential store
- **THEN** the authenticated product opens without requesting Google or an email code again

#### Scenario: Session expires
- **WHEN** a protected query receives an authentication-expired result
- **THEN** the UI clears protected projections, returns to login and does not display cached Account data as current

#### Scenario: User logs out
- **WHEN** the Human activates logout
- **THEN** the scoped credential and transient authentication state are revoked or deleted, the focused login surface returns and Account resources remain intact

#### Scenario: User signs in again after logout
- **WHEN** the Human starts a new Google or email-code login after logout
- **THEN** Google requires explicit account selection or email requires a newly issued code before the product issues a new device credential

### Requirement: Authentication secrets remain outside Renderer state
The product SHALL keep Google client secrets, SMTP credentials, Better Auth secrets, code hashes, temporary authentication sessions and long-lived device credentials outside Renderer snapshots, logs and MCP results. Renderer MAY hold the entered email and code only as current-step transient input and MUST discard them after success, cancellation, logout or restart.

#### Scenario: Either login method completes
- **WHEN** Better Auth has authenticated the Human through Google or email code
- **THEN** the Server issues a PKCE/nonce-bound one-time proof, Main exchanges and consumes it for the scoped device credential, and no Better Auth browser cookie or raw provider token becomes the product API credential

#### Scenario: Renderer state is inspected
- **WHEN** login, bootstrap, error reporting or diagnostics serialize Renderer-visible state
- **THEN** it contains only allowlisted Human/Account display fields and no code value, credential, SMTP secret, provider token, Better Auth session, reusable one-time proof or raw provider error

## ADDED Requirements

### Requirement: Email-code requests resist abuse and enumeration
The product SHALL generate a random six-digit code with a five-minute lifetime, no more than three verification attempts and a sixty-second resend interval. Codes and identifiers MUST be hashed at rest, MUST be single-use, and MUST NOT appear in logs, telemetry, errors or diagnostic snapshots. Request, resend and verification endpoints SHALL enforce persistent limits for both source IP and a keyed digest of normalized email while returning registration-neutral responses.

#### Scenario: A code is requested for any syntactically valid email
- **WHEN** the caller requests a code within all applicable limits
- **THEN** the API returns the same bounded acknowledgement regardless of registration state and sends mail only through the configured production transport

#### Scenario: A caller exceeds an email or IP limit
- **WHEN** request, resend or verification traffic exceeds either persistent rate-limit bucket
- **THEN** the server performs no additional code issuance or verification, returns a generic retry-later result and records no plaintext email or code

#### Scenario: A new code replaces an earlier code
- **WHEN** a permitted resend issues a new code for the same login attempt
- **THEN** the earlier code can no longer authenticate and the new code retains its own lifetime and attempt budget

#### Scenario: Email login capability is unavailable
- **WHEN** SMTP or Email OTP configuration is absent or unhealthy
- **THEN** the server does not advertise `email-otp-login`, the Desktop does not offer a nonfunctional email path, and Google login remains independently available
