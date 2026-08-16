# Runtime Adapter and Policy Boundary

## Contract

`packages/runtime-contract` owns the Runtime-neutral operations and normalized event union: detection, capabilities, create/resume, execute, cancellation, and close. Runtime handles are Edge-private and never appear in A2A, Account product projections, telemetry, or normalized errors.

The shared contract exercises unique session creation, exact-session resume, multi-turn output, progress, AbortSignal cancellation, no success after cancellation, isolation, close, and session loss. Both the deterministic Fake Runtime and the Codex ACP Adapter run this contract.

## Codex ACP source boundary

`adapters/runtime-codex-acp` launches the pinned official `@agentclientprotocol/codex-acp@1.1.14` process and speaks ACP through `@agentclientprotocol/sdk@1.3.0`. It depends only on the approved ACP boundary and does not drive the Codex App Server directly.

The ACP client advertises no terminal or filesystem-write capability, rejects every permission request, rejects client-mediated writes, requires `read-only` mode on new/resumed sessions, retains cancellation intent, drops thought content, and maps raw authentication/session/process/disconnect failures to bounded codes without forwarding stderr or exception text.

## Private session mapping

Edge maps the current `(AccountId, AgentId, RuntimeId, A2A contextId)` invocation to a private Runtime handle. Exact active mappings may resume; expired or lost mappings close and create a successor. Cloud sees only bounded task routing and state metadata—not the Runtime session ID, cwd, environment values, credentials or private Runtime context.

## Independent policy gate

Runtime execution is deny-by-default outside Runtime cooperation. `PolicyEnforcedRuntimeExecutor` refuses to start unless a `RuntimeIsolationPort` acquires an independent lease for filesystem read-only, network deny, and side-effects deny. The wrapper independently enforces timeout, tokenizer budget, concurrency, delegation depth, cancellation, isolation health, forced termination, and lease release.

The production app must provide a platform isolation implementation; absence or failure yields `isolation-unavailable` and no Runtime work. This keeps the policy boundary replaceable and prevents the Runtime process from declaring itself safe.
