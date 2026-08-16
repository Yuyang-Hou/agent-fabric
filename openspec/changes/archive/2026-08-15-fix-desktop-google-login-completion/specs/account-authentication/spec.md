## ADDED Requirements

### Requirement: Desktop loopback login completes as one activation transaction
The Desktop SHALL treat loopback callback receipt, login-code exchange, secure credential persistence, current Account session validation and protected bootstrap as one activation transaction. It MUST NOT report login success to the browser or Renderer until every required stage has completed successfully.

#### Scenario: Complete login succeeds
- **WHEN** a valid one-shot callback is exchanged, the credential is stored securely, session and Account identity agree, and protected bootstrap succeeds
- **THEN** the App enters the signed-in product and the browser reports final success

#### Scenario: Exchange succeeds but activation fails
- **WHEN** credential persistence, session validation, Account validation or protected bootstrap fails after callback receipt
- **THEN** the App remains signed out, newly written local credential material is cleared and the browser does not report success

#### Scenario: Cloud is an older product deployment
- **WHEN** the configured Cloud does not advertise the required `account-agents` feature during activation
- **THEN** the App remains signed out with a bounded incompatibility category and the browser does not report success

#### Scenario: A local service startup hangs
- **WHEN** Account identity is valid but Runtime or MCP startup does not settle before its bounded deadline
- **THEN** the App enters the signed-in product with that local service marked failed and login completion does not remain pending indefinitely

#### Scenario: Protected Account collections load from production MySQL
- **WHEN** an ordinary Account credential loads Agents, Runtimes, members, invitations and drafts during protected bootstrap
- **THEN** the shared actor lookup locks only non-null session authority rows, each collection loads successfully, and optional self-test authorization is not joined into the ordinary path

#### Scenario: Callback is duplicated
- **WHEN** a second callback reaches the same loopback listener after a valid callback has claimed the attempt
- **THEN** no second exchange or activation occurs and the duplicate receives a bounded non-success response

### Requirement: Loopback login failures are bounded and isolated
The Desktop SHALL bind the callback to loopback, exact path, method and client state, SHALL expire it within a bounded duration, and SHALL expose only allowlisted failure categories. OAuth codes, state, PKCE values, tokens, raw provider errors and raw secure-storage errors MUST NOT appear in browser HTML, Renderer snapshots, logs or MCP output.

#### Scenario: Wrong state is received
- **WHEN** a callback contains a missing or mismatched state
- **THEN** it is rejected without resolving, cancelling or revealing the pending valid login attempt

#### Scenario: Provider login is cancelled
- **WHEN** Google returns the supported cancellation outcome for the valid state
- **THEN** the listener closes, the App returns to a usable Google action and both App and browser report cancellation without creating a session

#### Scenario: Callback expires
- **WHEN** no valid callback completes before the bounded deadline
- **THEN** the listener closes, the App shows a retryable timeout category and no browser or Renderer output contains OAuth material

#### Scenario: Downstream failure contains sensitive text
- **WHEN** exchange, validation or secure storage throws an error containing provider content, a token, path or raw response
- **THEN** browser and Renderer receive only the corresponding allowlisted login failure category
