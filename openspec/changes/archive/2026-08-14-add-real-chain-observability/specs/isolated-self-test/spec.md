## MODIFIED Requirements

### Requirement: Self-test output is bounded and redacted
Human and JSON output MUST use a versioned stage report, every completed stage MUST include a monotonic duration, and a handled failure MUST expose only the failed stage, elapsed duration, stable failure class/code, and non-secret remediation object IDs. Output MUST NOT include Invitation Secret or URL, Device Token, Owner Token, Google email, OAuth Code, PKCE values, Prompt text, raw answer, private Edge context, runtime session ID, absolute workspace path, or raw downstream error.

#### Scenario: JSON report succeeds
- **WHEN** the operator uses `--json` and the self-test passes
- **THEN** the response contains only schema version, pass status, target Agent and Revision IDs, allowlisted stage statuses and durations, answer character count, and cleanup status

#### Scenario: A stage fails
- **WHEN** a preflight, authority, Google join, discovery, real ask, revocation, revocation-enforcement, or cleanup stage fails
- **THEN** the CLI returns the stable code plus only the failed stage, rounded duration, stable failure class, and any non-secret Invitation or Grant ID needed for remediation

#### Scenario: A downstream error contains a Secret
- **WHEN** a client, OAuth, Runtime, or cleanup dependency raises an error whose message includes credential-bearing or private input
- **THEN** the CLI maps it to a stable allowlisted failure class/code and emits none of the raw error message or Secret
