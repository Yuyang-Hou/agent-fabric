## Why

The first personal deployment is live, but a successful real ask currently exposes only one end-to-end duration (21 seconds in the latest acceptance) and Edge reconnects leave no bounded lifecycle evidence. Operators cannot distinguish gateway authorization/routing delay, Edge runtime time, persistence/projection time, or stable failure classes without inspecting ad-hoc raw errors.

## What Changes

- Add structured, versioned operation observations for the A2A ask path across Server and Edge, with monotonic phase durations, a safe correlation ID, outcome, and stable failure class.
- Add structured Edge connection lifecycle observations for connect, disconnect, and bounded-backoff reconnect scheduling.
- Route new Tasks to the newest authenticated same-Agent-Revision tunnel generation so a restarted observable Edge is not shadowed by another Revision or an older Deployment channel.
- Extend the isolated personal self-test so every completed stage records duration and handled failures expose only the failed stage, elapsed time, stable code, and stable failure class.
- Enforce a strict allowlist that excludes Prompt/answer bodies, ContextCapsules, Tokens, OAuth data, Runtime session IDs, Principal/Grant identifiers, absolute paths, and raw error messages.
- Keep observations ephemeral in ordinary structured logs; no new database persistence, external telemetry exporter, or A2A field is introduced.

Explicit non-goals:

- No distributed tracing vendor, dashboard, alert delivery, sampling backend, or long-term raw-event store.
- No change to A2A v1.0.1 payloads, Control Plane authorization, Runtime Adapter commands, or product UI.
- No model-output quality scoring, Token accounting, Prompt capture, or answer capture.

## Capabilities

### New Capabilities

- `real-chain-observability`: Defines privacy-bounded Server/Edge ask-phase and Edge reconnect observations with stable outcomes and failure classes.

### Modified Capabilities

- `isolated-self-test`: Extends the versioned self-test report and stable failure surface with per-stage durations and privacy-bounded failure classification.

## Impact

- Affects the Server A2A gateway/tunnel, Edge Host task/runtime and reconnect lifecycle, CLI isolated self-test report, and their automated tests.
- Adds a shared internal observation contract and JSON-line sink, but no third-party runtime dependency.
- Does not change public A2A schemas, Control Plane APIs, persistence schema, Runtime Adapter v1, or UI behavior.
