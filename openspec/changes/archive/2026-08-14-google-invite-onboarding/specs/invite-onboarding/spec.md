## ADDED Requirements

### Requirement: Owner issues a bounded one-time invitation
The Control Plane MUST allow only an authenticated Principal with `grant:manage` to create a revocable invitation for an Agent it owns, and MUST bind the invitation to one Agent, one existing Revision, a non-empty capability subset, an expiry, and a positive task budget.

#### Scenario: Owner creates an ask-only invitation
- **WHEN** an Agent Owner confirms creation for one Revision with capability `ask`, a future expiry, and 100 tasks
- **THEN** the server returns the invitation Secret exactly once and persists only its digest and bounded policy

#### Scenario: Caller attempts policy expansion
- **WHEN** a caller requests a capability absent from the Revision or an Agent owned by another Principal
- **THEN** the server rejects creation without persisting an invitation

#### Scenario: Invitation is revoked or expires
- **WHEN** a revoked or expired invitation is presented to start joining
- **THEN** the server rejects it and does not create a Join Session

### Requirement: Google OIDC authenticates the Human without becoming a Fabric credential
The server MUST use Authorization Code flow with exact redirect URI, state, nonce, issuer, audience, signature, expiration, and verified-email checks, and MUST NOT persist or return Google authorization codes, access tokens, refresh tokens, or ID tokens.

#### Scenario: Valid Google identity
- **WHEN** Google returns a valid code and ID Token for the configured Client, state, nonce, issuer, and verified email
- **THEN** the server binds the verified `(issuer, subject)` identity to exactly one Human Principal and continues enrollment

#### Scenario: Forged or mismatched callback
- **WHEN** state, nonce, issuer, audience, signature, expiry, redirect URI, or verified-email validation fails
- **THEN** the server rejects the callback, creates no Device Credential or Grant, and records only an allowlisted failure category

#### Scenario: OAuth configuration is absent
- **WHEN** the server starts without a complete valid Google OAuth configuration
- **THEN** existing health, Token, A2A, and Edge capabilities remain available while invitation-login endpoints return `oidc-unavailable`

### Requirement: CLI join completes through loopback PKCE
The CLI SHALL support `agent-fabric join <invite-url>` by binding a loopback listener, generating high-entropy local state and PKCE values, opening the returned authorization URL, validating the loopback response, and exchanging the one-time code without asking the user to copy a credential.

#### Scenario: Successful one-command join
- **WHEN** a user runs `join`, completes Google login in the browser, and returns before timeout
- **THEN** the CLI receives a Device Credential once, stores the resulting Fabric configuration atomically with private permissions, and reports the joined Agent and Revision

#### Scenario: Loopback interception lacks verifier
- **WHEN** another local process obtains the Exchange Code without the PKCE verifier
- **THEN** the server rejects exchange and reveals no Device Credential

#### Scenario: User cancels or join times out
- **WHEN** the browser flow is cancelled or the CLI timeout elapses
- **THEN** the CLI exits with a stable non-zero error, does not overwrite an existing valid config, and the short-lived session cannot later mint a credential after expiry

### Requirement: Enrollment creates isolated Device authority atomically
The server MUST atomically find or create the Human, create a new Device Principal, issue a Device Credential with only requester scopes, create a Grant fixed to the invitation policy, consume the invitation and Join Session, and write an allowlisted audit event.

#### Scenario: First device for a new Human
- **WHEN** a previously unseen Google subject exchanges a valid code and verifier
- **THEN** one Human, one owned Device, one requester Credential, and one fixed-Revision Grant are committed together

#### Scenario: Additional device for an existing Human
- **WHEN** the same Google subject joins from another machine with a different invitation
- **THEN** the Human Principal is reused while the Device, Credential, and Grant are distinct and independently revocable

#### Scenario: Concurrent replay
- **WHEN** two requests concurrently exchange the same code or invitation
- **THEN** exactly one transaction succeeds and the other fails without creating partial or duplicate authority

### Requirement: Invitation policy cannot be widened during redemption
The enrollment exchange MUST derive Agent, Revision, capabilities, expiry, budget, owner, and requester scope from server-side invitation and policy constants, not from callback or CLI-supplied authority fields.

#### Scenario: Tampered join request
- **WHEN** a client adds a different Agent, Revision, capability, expiry, budget, or credential scope to a join or exchange request
- **THEN** the server ignores no authority-bearing field silently and rejects the malformed request without widening access

#### Scenario: Invitation validity exceeds credential limit
- **WHEN** invitation expiry is later than the configured Device Credential maximum
- **THEN** the credential expiry is capped while the Grant remains no broader than the invitation

### Requirement: Codex MCP is configured without copying the Device Token
After joining, the CLI SHALL use the supported `codex mcp` command to register the local stdio Agent Fabric MCP against the private Agent Fabric config, and MUST NOT write the Device Token into Codex MCP configuration.

#### Scenario: First-time Codex setup
- **WHEN** `codex` is installed and no `agent-fabric` MCP entry exists
- **THEN** the CLI registers the MCP, verifies it is listed, and reports that a Codex restart or new task can use Agent Fabric tools

#### Scenario: Existing MCP entry
- **WHEN** an `agent-fabric` MCP entry already exists
- **THEN** the CLI preserves it and reports a stable `mcp-configuration-conflict` with an explicit retry or replace action

#### Scenario: Codex unavailable
- **WHEN** the Codex CLI is missing or MCP registration fails after enrollment
- **THEN** the Device identity remains valid, the result is `joined-mcp-pending`, and `agent-fabric mcp install` can retry without another Google login

### Requirement: Sensitive enrollment material never enters normal persistence or logs
The server and CLI MUST redact invitation Secrets, OAuth codes/tokens, Exchange Codes, PKCE verifiers, Device Tokens, and verified email from normal logs, errors, audit metadata, JSON status output, and database fields except required digests and the private local credential file.

#### Scenario: Successful and failed enrollment inspection
- **WHEN** tests exercise successful login, invalid state, invalid token, timeout, replay, and MCP configuration failure
- **THEN** repository rows, application logs, audit metadata, CLI stdout/stderr, and test snapshots contain none of the prohibited raw values
