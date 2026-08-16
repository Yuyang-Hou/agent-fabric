## MODIFIED Requirements

### Requirement: Owner can run an isolated real-path self-test
The CLI SHALL provide a human-confirmed self-test for an existing accessible Account Agent and MUST verify truthful online availability, creation of a short-lived in-memory Account self-test requester, four-tool MCP discovery, one real standard A2A Message result, Task read, requester revocation and post-revocation denial. It MUST NOT require or create an Agent Revision, Deployment, Friend, Invitation, ContextCapsule or legacy publication state.

#### Scenario: Owner completes the Account loop
- **WHEN** an authenticated Account Owner runs `agent-fabric self-test --agent <Agent ID> --confirm` for an accessible online Agent
- **THEN** the Control Plane creates a distinct least-privilege requester credential bound only to that Account and Agent, and the CLI completes all stages without granting Account management scopes

#### Scenario: Agent returns a real answer
- **WHEN** the requester sends the self-test Message through `ask_agent`
- **THEN** the returned standard A2A Task is completed with a non-empty text Artifact, `get_task` reads the same Task, and the report records only its character count and duration

#### Scenario: Agent is unavailable
- **WHEN** the selected Agent is not accessible, online and Runtime-bound before requester creation
- **THEN** the CLI fails with a stable preflight error and creates no requester credential or A2A Task

### Requirement: Self-test authority remains isolated from the user environment
The CLI MUST keep the Account self-test requester credential in memory and MUST NOT write or replace the normal Agent Fabric config, Codex MCP config, installed Skills, local Host configuration, Runtime credential or Owner session.

#### Scenario: Self-test succeeds
- **WHEN** every Account self-test stage completes
- **THEN** the CLI exits without changing user configuration or service files and no requester secret is persisted

#### Scenario: Self-test fails after requester creation
- **WHEN** MCP discovery, A2A invocation or Task read fails
- **THEN** the CLI preserves the existing user environment byte-for-byte and attempts to revoke the temporary requester

### Requirement: Self-test cleans up and proves revocation
The CLI MUST revoke the temporary Account self-test requester on success and MUST make a bounded best-effort cleanup on every handled failure after creation. A successful report MUST prove that the revoked requester can no longer discover or invoke the selected Agent.

#### Scenario: Revocation is enforced
- **WHEN** the first real A2A Task completes and the Owner revokes the self-test requester
- **THEN** its MCP no longer discovers the Agent and a subsequent `ask_agent` is rejected before Edge Runtime execution

#### Scenario: Cleanup fails
- **WHEN** requester revocation cannot be confirmed after bounded retries
- **THEN** the CLI MUST NOT report success and SHALL return a stable cleanup error with only the non-secret self-test identifier needed for remediation

### Requirement: Self-test output is bounded and redacted
Human and JSON output MUST use a versioned Account self-test stage report and MUST NOT include requester token, Owner token, Google identity, OAuth code, Prompt text, raw answer, private Edge context, Runtime session ID, absolute path, private Skill/MCP configuration, Revision ID, Deployment ID or legacy invitation data.

#### Scenario: JSON report succeeds
- **WHEN** the operator uses `--json` and the self-test passes
- **THEN** the response contains only schema version, pass status, Account and target Agent IDs, allowlisted stage statuses, durations, answer character count and revocation status

#### Scenario: A downstream error contains private data
- **WHEN** a Cloud, MCP, Edge or Runtime dependency raises an error whose message includes private data
- **THEN** the CLI maps it to a stable allowlisted error code and emits none of the raw error message or private value
