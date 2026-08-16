## 1. Isolated orchestration

- [x] 1.1 Implement a testable self-test orchestrator for Presence, bounded Invitation, in-memory join, Discovery and one real A2A ask.
- [x] 1.2 Enforce Grant and Invitation cleanup on success, OAuth cancellation, downstream failure and cleanup failure.
- [x] 1.3 Verify post-revocation Discovery removal and A2A denial without forwarding the second Message to Edge.

## 2. CLI integration

- [x] 2.1 Add `agent-fabric self-test --confirm` with existing Owner Agent/Revision defaults, browser OAuth join and bounded flags.
- [x] 2.2 Emit versioned redacted human/JSON reports without persisting requester authority or modifying MCP, Skills, Edge or user config.
- [x] 2.3 Update CLI help and headless deployment documentation with the self-test workflow and Google OAuth human boundary.

## 3. Verification

- [x] 3.1 Add unit tests for success, offline preflight, OAuth cancellation, ask failure, revocation enforcement, cleanup failure and sensitive-output redaction.
- [x] 3.2 Run CLI tests, unit/contract suites, lint, typecheck and source policy.
- [x] 3.3 Validate `add-isolated-self-test`, `trusted-agent-messenger-mvp` and `agent-fabric-v1-foundation` with strict OpenSpec validation.
- [x] 3.4 Build the installable client and complete a real personal Railway self-test using the same Google account, pausing only for OAuth confirmation.

## Evidence

- 2026-08-13: personal Railway same-account self-test passed Presence, bounded Invitation, Google join, requester Discovery, one real A2A ask, Grant revocation, post-revocation Discovery/A2A denial, and Invitation cleanup.
- 2026-08-13: the real Agent answer completed in 21,147 ms with 11 answer characters; the report emitted no prompt, answer, OAuth value, credential or email.
- 2026-08-13: focused CLI verification passed 19 tests; typecheck and lint passed before the live run.
