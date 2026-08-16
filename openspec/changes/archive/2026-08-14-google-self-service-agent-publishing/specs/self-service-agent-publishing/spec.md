## ADDED Requirements

### Requirement: Google user can establish a self-service Owner identity
The Control Plane MUST allow a verified Google Human to complete an invitation-free Authorization Code, state, nonce, exact redirect, loopback PKCE login and receive a Device Credential limited to self-owned Agent management without receiving `server:admin`.

#### Scenario: First login creates bounded Owner Device
- **WHEN** an allowed, previously unseen Google subject completes self-service login
- **THEN** the server atomically creates one Human, one owned Device and one Owner Credential with the fixed self-service scopes

#### Scenario: Existing invited Human signs in as Owner
- **WHEN** a Google subject already mapped through invitation onboarding completes self-service login
- **THEN** the server reuses the Human and creates a distinct Owner Device without copying requester Grants or credentials

#### Scenario: Login is forged, disallowed or replayed
- **WHEN** OIDC validation, allowlist, PKCE, state, expiry or one-time exchange validation fails
- **THEN** the server creates no authority and returns no Fabric Credential

### Requirement: Self-service authority is restricted to owned Agents
The Control Plane MUST require both the relevant Credential Scope and verified ownership for Agent Revision publication, Grant and Invitation management, and self-service device credential issuance.

#### Scenario: Owner manages own Agent
- **WHEN** an Owner Device creates an Agent and publishes a Revision or invitation for it
- **THEN** the server accepts the operation and records the Human as the Agent owner

#### Scenario: Owner targets another Human's Agent
- **WHEN** an Owner Device with a valid operation Scope targets an Agent owned by another Human
- **THEN** the server rejects the operation without changing the Agent, Revision, Grant, Invitation or Credential state

#### Scenario: Device lacks operation Scope
- **WHEN** a Device owned by the correct Human lacks the required Scope
- **THEN** ownership alone does not authorize the operation

### Requirement: One publish flow reaches an online local Agent
The CLI SHALL provide one user-facing publish flow that ensures Google login, accepts a bounded ContextCapsule with explicit disclosure confirmation, creates or reuses a self-owned Agent, publishes a Revision, configures Codex MCP, provisions a bound Edge Device, starts the local Edge service, and verifies the published deployment is online.

#### Scenario: First successful publication
- **WHEN** a logged-out macOS user publishes a valid ContextCapsule and confirms disclosure
- **THEN** the CLI completes Google login, publication and local configuration, then returns the Agent, Revision and invitation next action only after Edge is online

#### Scenario: Disclosure is not confirmed
- **WHEN** the user does not provide the exact disclosure confirmation
- **THEN** the CLI uploads no Revision, provisions no Edge Credential and makes no runtime change

#### Scenario: Publication partially succeeds
- **WHEN** the Revision is committed but MCP registration or Edge startup fails
- **THEN** the CLI reports a non-success stage and a deterministic retry that reuses committed objects without duplicating Agent ownership

#### Scenario: Existing MCP registration points to another deployment
- **WHEN** publish, join or `mcp install` finds an existing `agent-fabric` MCP registration
- **THEN** the CLI replaces it with the installed client MCP executable and active private config path, verifies that exact registration, and exposes no raw credential in Codex configuration

#### Scenario: Unsupported automatic Edge platform
- **WHEN** the publish flow runs on a platform without an automatic Edge service installer
- **THEN** the CLI reports `edge-install-manual-required` with an explicit headless continuation and does not report the Agent online

### Requirement: Public client distribution includes Codex integration
The installable client served by Agent Fabric SHALL include the CLI, MCP host, Edge runtime and the Agent Fabric Codex Skills, and successful publish, join or `mcp install` SHALL install the Skills into a supported user-local Codex discovery location.

#### Scenario: User installs from the public service
- **WHEN** a user installs the package returned by `/v1/client/agent-fabric-client.tgz`
- **THEN** the installed package contains all three executables and both bounded Agent Fabric Skills without requiring the source repository or a company package registry

#### Scenario: Codex integration is configured
- **WHEN** publish, join or `mcp install` completes Codex integration
- **THEN** the two Agent Fabric Skills are present under the user-local `.agents/skills` location and the MCP registration reads credentials only from the private Agent Fabric config file

### Requirement: Automated credentials remain isolated and hidden
The system MUST create distinct Owner, MCP requester and Agent-bound Edge Device Credentials, store them only in private local configuration as digests on the server, and MUST NOT expose them in CLI output, Codex MCP configuration, browser redirects, application logs or audit metadata.

#### Scenario: Owner asks own published Agent
- **WHEN** publication completes and the user opens a new Codex task
- **THEN** MCP uses its requester Device and fixed-Revision Grant rather than the Owner or Edge Credential

#### Scenario: One credential is revoked
- **WHEN** the MCP, Owner or Edge Credential is independently revoked
- **THEN** the other device credentials do not inherit its authority or token and remain governed by their own status

#### Scenario: Diagnostic output is inspected
- **WHEN** successful and failed login, publish, MCP and Edge operations are logged or emitted as JSON
- **THEN** no raw Google token, authorization code, exchange code, PKCE verifier or Fabric Device Token is present

### Requirement: Edge Credential is bound to one Agent
Every Edge Credential issued by the self-service flow MUST be bound to exactly one Agent, and the Edge connection MUST fail before deployment registration when the authenticated binding differs from the handshake Agent.

#### Scenario: Bound Edge connects to its Agent
- **WHEN** an Edge Device authenticates and supplies its bound Agent and a Revision belonging to that Agent
- **THEN** the server registers the deployment for that Agent

#### Scenario: Bound Edge switches Agent
- **WHEN** an Edge Device authenticates but supplies another Agent in the handshake
- **THEN** the server rejects the connection and creates or updates no deployment

#### Scenario: Revision does not belong to bound Agent
- **WHEN** the handshake Revision belongs to another Agent
- **THEN** the server rejects the connection before exposing any task
