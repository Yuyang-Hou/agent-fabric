## Context

The current personal deployment already reports a single end-to-end ask duration from `agent-fabric self-test`, while Server and Edge have almost no structured lifecycle output. The Server can measure authorization, tunnel dispatch, and A2A projection; the Edge can separately measure task intake, Runtime execution, response emission, and connection/reconnect behavior. Neither side may log message content, private Edge state, credentials, or raw dependency errors.

The components run in different trust and deployment boundaries: Server logs are collected by Railway, while Edge logs remain in the Owner's local service log. They can share a privacy-safe correlation digest derived from the A2A Task ID, but they must not exchange a private tracing extension through A2A.

## Goals / Non-Goals

**Goals:**

- Make a slow or failed ask attributable to a bounded Server or Edge phase.
- Make Edge connect, disconnect, and reconnect-backoff behavior visible without identifiers or credentials.
- Give the personal self-test per-stage timing and stable failure classification.
- Make the event shape testable and reject extra/private fields before serialization.

**Non-Goals:**

- No third-party telemetry backend, metrics database, tracing SDK, dashboard, or alert channel.
- No A2A payload/header extension, persistence migration, Runtime Adapter protocol change, or product UI.
- No Prompt, answer, Capsule, Token, OAuth, path, runtime handle, Principal, Grant, Agent, Revision, or Deployment identifiers in observation events.

## Decisions

### 1. Use one strict shared observation schema and injected sinks

`@agent-fabric/fabric-contracts` will own a strict version-1 schema for operation observations. Allowed fields are component, operation, phase, outcome, monotonic duration, optional attempt/backoff, optional Task correlation digest, and optional stable failure class/code. Server and Edge receive an injected observation sink; executable entrypoints bind it to one JSON object per stdout line.

This keeps the vocabulary identical across trust boundaries and makes privacy tests deterministic. A logging framework was considered but rejected because it adds a production dependency and still requires a separate allowlist contract.

### 2. Correlate asks with a one-way Task digest

Server and Edge independently derive `sha256:<hex>` from the standard Task ID and emit only that digest. No Principal, Grant, Agent, Revision, Deployment, Context, Message, or Runtime ID is logged.

Raw Task IDs were considered because the Cloud already stores Task metadata, but a digest provides sufficient cross-log correlation with less accidental exposure. Adding a trace field to A2A was rejected because there is no interoperability gap and standard A2A payloads must remain unchanged.

### 3. Measure only locally owned phases with monotonic clocks

Server emits authorization/routing, tunnel-dispatch, task-projection, and total observations. Edge emits task-intake, runtime-execution, response-emission, and total observations. `performance.now()` (or an injected monotonic clock in tests) supplies durations; wall-clock timestamps are left to the process log collector.

The Server's tunnel-dispatch duration intentionally includes remote Edge work, while the Edge's runtime duration isolates model/runtime time. Clock synchronization is unnecessary because only durations are compared and the correlation digest joins the two views.

### 4. Normalize failures at the boundary that owns them

Each component maps known exceptions and protocol states to a closed set of failure classes such as authorization, unavailable, transport, timeout, protocol, runtime-authentication, runtime-policy, runtime-unavailable, runtime-failure, persistence, canceled, and unknown. Only allowlisted stable codes are emitted; raw exception messages, stacks, close reasons, and remote response bodies are never included.

Edge task failures produce a standard failed A2A Task when the socket remains usable, so the Server observes a bounded runtime failure instead of converting every Runtime error into an unexplained disconnect. Protocol-corrupt input still fails closed and may close the channel.

### 5. Extend self-test reporting without persisting credentials

The self-test wraps each stage with the same injected monotonic clock. Successful stages record duration. Handled failures add only `stage`, rounded `durationMs`, `failureClass`, and existing non-secret remediation object IDs to `SelfTestError`; CLI JSON continues using schema version 1 and no user configuration is modified.

### 6. Route an Agent Revision to its newest authenticated tunnel generation

The in-memory tunnel registry will bind every authenticated channel to both Agent ID and Revision ID, then select the highest local registration generation among currently connected channels for the requested Agent Revision. A restart may temporarily leave an older Deployment ID connected, but new Tasks must use the newest authenticated channel for the exact Revision; another Revision is ineligible, and an older matching channel may finish already-pending work but cannot shadow the replacement.

Selecting by Agent ID alone or taking the first Map insertion was rejected because a new process normally has a new PID-derived Deployment ID and one Agent may have multiple live Revisions. Replacement-by-Deployment-ID alone does not remove a still-connected older channel, while Agent-only routing can send a Task to the wrong Revision. Persisted `connectedAt` was also rejected for live routing because the registry already owns an unambiguous monotonic generation and does not need wall-clock ordering.

## Risks / Trade-offs

- [Separate Server and Edge logs require manual correlation] → Use the same Task correlation digest and stable phase names; add an exporter only in a future change.
- [stdout observations increase log volume] → Emit one bounded record per phase/transition and never emit deltas, heartbeats, Prompt, or answer content.
- [Failure normalization can hide debugging detail] → Preserve raw errors only as in-memory causes for local code flow; expose stable classes/codes and cover mappings with tests.
- [A Runtime failure response changes disconnect behavior] → Keep protocol violations fail-closed, and verify failed Tasks contain no raw error or partial output.
- [Hashing low-entropy IDs is not anonymization] → Treat the digest only as a correlation handle and prohibit all other relationship identifiers; no external export is added.
- [A brief overlap leaves multiple same-Agent or same-Revision channels connected] → Match the requested Agent Revision first, route new work to its highest authenticated registry generation, and retain older matching channels only for already-pending Tasks until disconnect.

## Migration Plan

1. Land the shared schema, helpers, and privacy tests with sinks disabled by default inside library constructors.
2. Instrument Server and Edge paths, then enable JSON-line sinks only in their executable entrypoints.
3. Extend self-test timing/failure details and update CLI tests.
4. Deploy the existing Server image and restart/reinstall Edge through the normal release path; no database migration is required.
5. Roll back by deploying the previous binaries. Existing A2A, Control Plane, database, and local state remain compatible.

## Open Questions

- A future alerting change must decide retention, sampling, thresholds, and operator destination after enough privacy-bounded observations are available; none are required for this implementation.
