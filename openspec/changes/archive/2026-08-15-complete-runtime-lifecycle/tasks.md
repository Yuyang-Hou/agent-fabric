## 1. Runtime detection contracts

- [x] 1.1 Extend Fake Runtime and lifecycle tests for ready, authentication-required, unavailable, offline/timeout and sensitive-error redaction.
- [x] 1.2 Add single-flight and remote-Runtime isolation tests proving one local detection and no mutation of non-local records.
- [x] 1.3 Add restart recovery tests proving a matching stale `checking` Runtime converges before the execution tunnel is considered available.

## 2. Edge lifecycle implementation

- [x] 2.1 Add bounded, serialized refresh/recovery behavior to Account Runtime Registration Service while preserving the active local Runtime identity.
- [x] 2.2 Map real Adapter detection and capability results to bounded Control Plane observations, including terminal fallback after failure or timeout.
- [x] 2.3 Expose the local refresh operation through DesktopAccountRuntime/SessionServices without exposing Adapter handles to Renderer.

## 3. Packaged Codex discovery

- [x] 3.1 Reuse the Edge Codex executable resolver in Desktop Main and pass an Edge-only `CODEX_PATH` override to `codex-acp`.
- [x] 3.2 Add resolver and packaged-resource tests for installed ChatGPT success and missing executable failure without private-path leakage.

## 4. Desktop product integration

- [x] 4.1 Route `runtime-refresh` through the local lifecycle port and return/push the terminal Runtime projection instead of treating the Control Plane checking acknowledgement as completion.
- [x] 4.2 Add loading, terminal failure, authentication guidance and remote-device refresh behavior to Runtime list/detail while keeping only ready Runtimes bindable.
- [x] 4.3 Update Host, IPC and Renderer tests for checking-to-terminal transitions, repeat clicks, invalidation updates and creation selector recovery.

## 5. Validation and real acceptance

- [x] 5.1 Run focused unit/contract tests, TypeScript/build checks and strict validation for `complete-runtime-lifecycle` plus both required product-authority changes.
- [x] 5.2 Build the final local App artifact and verify its packaged `codex-acp` can start the installed logged-in ChatGPT Codex through the resolved path.
- [x] 5.3 Launch the built App, click Runtime refresh, verify a non-checking terminal state, then open Agent creation and select the Runtime; retain bounded evidence.
- [x] 5.4 Correct any superseded completion checkbox in `multica-aligned-agents-product/tasks.md` only after the real App acceptance succeeds.

## 6. A2A result continuity found during real walkthrough

- [x] 6.1 Add a server contract test proving Runtime heartbeat/version changes do not replace the Task Store used by an active or completed A2A Task.
- [x] 6.2 Keep the per-Agent Task Store stable across Handler/Card refreshes and bound client Task reads so completed Edge execution cannot surface as `agent-unavailable` or hang indefinitely.
- [x] 6.3 Repeat the real local MCP → standard A2A ask/get flow and verify the exact terminal text Artifact appears while Desktop activity shows the same terminal Task metadata.

## 7. Desktop restart and MCP continuity

- [x] 7.1 Add a file-backed MCP Gateway that reloads and validates the atomically replaced private loopback configuration for every operation without exposing its values.
- [x] 7.2 Add tests proving one long-lived MCP server uses the replacement endpoint/token after Desktop restart and recovers after a temporarily missing or invalid configuration.

## 8. Runtime tunnel and heartbeat recovery

- [x] 8.1 Add bounded single-flight Runtime WebSocket reconnect after an established connection closes, with explicit-stop cancellation and stale-socket isolation tests.
- [x] 8.2 Make Cloud heartbeat/offline observations use the latest Runtime version, retry one version conflict and keep later observations alive after an earlier failure.
- [x] 8.3 Add contract tests for manual refresh versus heartbeat version races and observation queue recovery.
- [x] 8.4 Restart the development App without packaging, verify the existing MCP process recovers, then repeat exact MCP → A2A terminal-result and Desktop activity acceptance.

## 9. Account events liveness recovery

- [x] 9.1 Add bounded server heartbeat frames and a Desktop liveness deadline that replaces half-open Account events sockets without leaking business or credential data.
- [x] 9.2 Add stale-socket, single-reconnect and heartbeat-reset tests, then repeat real activity synchronization after a Cloud replacement.

## 10. Restore failure classification

- [x] 10.1 Preserve an existing secure App session across transient Cloud/bootstrap failures while still stopping partial local services; clear only explicit authentication/identity rejection.
- [x] 10.2 Add restore classification and Host cleanup tests, then verify one final login survives subsequent healthy App restarts.
- [x] 10.3 Replace MySQL-incompatible bound LIMIT values with validated integer SQL literals across protected bootstrap collections and retain SQL-shape tests.
