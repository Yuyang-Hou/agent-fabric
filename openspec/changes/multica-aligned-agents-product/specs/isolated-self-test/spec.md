## MODIFIED Requirements

### Requirement: Owner can run an isolated real-path self-test
The CLI SHALL provide a human-confirmed self-test for an existing owned or invokable Agent in the Account and MUST verify truthful Presence, unified invocation access, MCP discovery, one real standard A2A Message result, access revocation or isolation, and post-revocation denial without depending on a single Personal Agent, Agent Revision or Friendship.

#### Scenario: Account owner completes the loop
- **WHEN** an authenticated owner runs `agent-fabric self-test --agent <Agent ID> --confirm` for an accessible online Agent
- **THEN** the Server creates a distinct short-lived requester Device Credential bound to that exact Account and Agent and the CLI completes all stages without another Human login or Account owner/admin authority

#### Scenario: Agent returns a real answer
- **WHEN** the isolated requester discovers the selected Agent and sends the self-test A2A Message
- **THEN** the returned standard Task is completed with a non-empty text Artifact and the report records only its character count and duration

#### Scenario: Agent is unavailable
- **WHEN** the selected Agent is archived, unbound, offline or unauthorized before the send
- **THEN** the CLI fails with a stable preflight error and creates no A2A Task

### Requirement: Self-test authority remains isolated from the user environment
The CLI MUST keep the self-test requester credential in memory and MUST NOT write or replace the normal Agent Fabric config, Codex MCP config, installed Skills, service files, Edge credential, Runtime configuration, Agent configuration or owner credential.

#### Scenario: Self-test succeeds
- **WHEN** every self-test stage completes
- **THEN** the CLI exits without changing any user configuration, Agent, Runtime or service file and no requester secret is persisted

#### Scenario: Temporary credential issuance or MCP connection fails
- **WHEN** short-lived credential issuance or the in-memory MCP requester connection fails
- **THEN** the CLI reports a stable failure, preserves the existing user environment byte-for-byte and attempts to revoke any temporary access already created

### Requirement: Self-test cleans up and proves revocation
The CLI MUST revoke the temporary Agent access and requester session on success and MUST make a best-effort cleanup on every handled failure after either is created. A successful report MUST prove that the revoked requester can no longer discover, invoke or read new Task state for the target Agent.

#### Scenario: Revocation is enforced
- **WHEN** the first real A2A Task completes and temporary access is revoked
- **THEN** the requester no longer discovers the target Agent and a subsequent A2A Message is rejected before it reaches Edge Runtime

#### Scenario: Main flow fails after access grant
- **WHEN** MCP discovery or the first A2A Task fails after temporary access is issued
- **THEN** the CLI attempts to revoke both access and requester session before returning failure

#### Scenario: Cleanup fails
- **WHEN** cleanup cannot be confirmed
- **THEN** the CLI MUST NOT report the self-test as passed and SHALL return a stable cleanup error with only non-secret IDs needed for remediation

### Requirement: Self-test output is bounded and redacted
Human and JSON output MUST use a versioned stage report and MUST NOT include the self-test Device Token, owner token, Google email, Prompt text, raw answer, private Agent configuration, private Edge context, Runtime session ID, environment value or absolute path.

#### Scenario: JSON report succeeds
- **WHEN** the operator uses `--json` and the self-test passes
- **THEN** the response contains only schema version, pass status, Account/target Agent IDs, allowlisted stages, durations, answer character count and cleanup status

#### Scenario: Downstream error contains a secret
- **WHEN** a client, credential, MCP, A2A or Runtime dependency raises an error containing private input
- **THEN** the CLI maps it to an allowlisted code and emits none of the raw error or secret
