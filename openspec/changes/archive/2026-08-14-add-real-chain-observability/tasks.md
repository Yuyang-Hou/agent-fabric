## 1. Shared observation contract

- [x] 1.1 Add the strict versioned observation schema, stable phase/failure vocabularies, Task correlation helper, JSON-line sink, and contract/privacy tests.

## 2. Server ask-path observations

- [x] 2.1 Instrument Server authorization/routing, tunnel dispatch, A2A projection, and total durations with success and stable failure observations.
- [x] 2.2 Add Server tests for successful phase records, offline/disconnect/timeout/protocol failures, strict redaction, and unchanged A2A payloads.

## 3. Edge task and reconnect observations

- [x] 3.1 Instrument Edge task intake, Runtime execution, response emission, and total durations; return a bounded failed A2A Task for handled Runtime failures without dropping a healthy tunnel.
- [x] 3.2 Instrument connect, disconnect, and bounded-backoff reconnect observations while suppressing false failures/retries on intentional stop.
- [x] 3.3 Add Edge tests for successful/failed task phases, reconnect schedules, strict redaction, and no raw error or partial output in failed Tasks.
- [x] 3.4 Bind tunnel channels to Agent Revision, route new Tasks to the newest authenticated generation for the exact Revision, and test overlapping Revisions and Deployment IDs.

## 4. Isolated self-test diagnostics

- [x] 4.1 Record duration for every completed self-test stage and return privacy-bounded failed stage, elapsed duration, stable failure class/code, and non-secret remediation IDs.
- [x] 4.2 Update CLI/self-test golden tests for successful per-stage timing and stable redacted failure details.

## 5. Verification

- [x] 5.1 Run focused tests, unit and contract suites, build, lint, typecheck, source policy, package boundaries, development release gates, and strict OpenSpec validation for this change plus the two required foundation changes.
