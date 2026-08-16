## Context

The production API is reachable and exposes `/v1/auth/login/start`, `/v1/auth/login/exchange`, `/v1/session` and `/v1/account`. The contradiction is created locally: `listenForCallback` writes a success page immediately after receiving a matching `code` and `state`, while code exchange, secure storage, session/account validation and local-service activation happen afterward in separate layers. Any failure in those later steps leaves the browser claiming success while the App correctly remains signed out.

OAuth code, state, PKCE material and tokens are Main/server-only. The Renderer may receive only stable, allowlisted failure categories. The callback is loopback-only and must remain one-shot, time-bounded and resistant to unsolicited or duplicate requests.

## Goals / Non-Goals

**Goals:**

- Treat login as one activation transaction from browser callback through validated Account bootstrap and secure credential persistence.
- Make the browser and App report the same final outcome.
- Preserve actionable failure categories without exposing raw provider, server, keychain or network errors.
- Make cancellation, timeout, duplicate callback and cleanup deterministic and testable.

**Non-Goals:**

- Changing Google OIDC, Account membership or credential lifetimes.
- Returning OAuth material to Renderer or adding client-side token storage.
- Adding password, OTP, embedded webview login, A2A or Runtime behavior.

## Decisions

### 1. Let the authentication orchestrator own final activation

`AccountProductGoogleLoginPort.login` will accept a Main-process activation callback. `DesktopGoogleLogin` performs start, browser handoff, loopback receipt and code exchange, then invokes that callback with the exchanged token. `DesktopAccountProductAuthentication` uses the callback to write the secure vault, load `/v1/session` and `/v1/account`, verify Account identity and start local services. Its Main-only authentication port in turn accepts the Host bootstrap callback, so the callback response remains pending until the signed-in snapshot's required Agent, Runtime and member collections have loaded.

Only after the nested callback chain and protected Host bootstrap resolve does `DesktopGoogleLogin` send the browser success page. If any layer rejects, the login promise rejects with an allowlisted category and the browser receives a generic failure page. This keeps the token inside Main and avoids a second out-of-band completion channel. Merely loading `/v1/session` and `/v1/account` is not final success.

Alternative: keep the current `login(): token` API and add a later `complete()` call. Rejected because callers could forget or race the completion call, recreating split truth.

### 2. Hold exactly one valid callback response until completion

The loopback listener rejects wrong path/method/state without changing the pending login. The first valid callback claims the attempt and exposes a bounded responder to the login orchestrator. Later valid callbacks receive a conflict/processing response and cannot trigger another exchange. Provider cancellation is handled as a final attempt with a bounded cancellation page.

The listener closes after the final response has been written, or on open-browser failure/timeout. Response headers disable caching, framing, MIME sniffing and referrer propagation. Page bodies contain no query values or raw errors.

Alternative: acknowledge receipt and update the page by polling another loopback endpoint. Rejected as unnecessary additional attack and lifecycle surface.

### 3. Normalize failures at the Main trust boundary

Failures map to a fixed set: `login-cancelled`, `login-callback-timeout`, `login-callback-invalid`, `login-exchange-failed`, `login-session-invalid`, `login-secure-storage-failed`, and `server-unreachable`. The App maps these codes to recovery copy; the browser only distinguishes cancelled, timed out and unsuccessful. Raw OAuth/provider/server/keychain errors are neither rendered nor logged.

### 4. Verify the real staged transaction

Focused tests will hold the browser request open and prove it does not receive success before the activation callback resolves. Tests cover activation success, exchange failure, vault failure, invalid Account bootstrap, duplicate callback, wrong state, cancellation and timeout. Packaged verification must exercise the callback responder and confirm no token/code/state appears in browser HTML or Renderer snapshots.

### 5. Require Cloud product compatibility before login success

The Desktop must call `/v1/version` during Account activation and require the `account-agents` feature before treating the Cloud as compatible. This fails with a stable `login-cloud-incompatible` category before protected collection hydration when an older Personal Agent deployment is serving the configured origin. It avoids interpreting downstream schema failures as generic login failures and makes deployment drift observable without exposing response bodies.

Local Runtime and MCP startup are status-bearing bootstrap work, not authentication authority. Each startup receives a hard deadline; timeout produces a bounded failed service status while the validated Account continues into the product. A hung local service must never hold the browser callback or App on the login screen indefinitely.

### 6. Keep Account actor locking compatible with production MySQL

The shared Account actor lookup locks the session, membership and credential rows using inner joins only. Optional self-test authorization is resolved by a second, narrowly scoped locking query after the credential scopes are known. A nullable `LEFT JOIN` participant must not be included in the common `SELECT ... FOR UPDATE`, because the production MySQL prepared-statement path rejects that query before any protected collection can load.

This preserves transaction-time authorization locking for normal Account operations while keeping the exceptional self-test grant explicit and bounded to one Agent.

## Risks / Trade-offs

- [Browser request remains open during slow bootstrap] → Bound the overall attempt and display a minimal processing document only if future browser compatibility requires it; current activation is expected to finish quickly.
- [User closes the browser tab] → The App still completes safely; response write failure does not roll back an already validated session.
- [Secure storage succeeds but later bootstrap fails] → Clear the newly written session before reporting failure.
- [App exits during activation] → Loopback closes with the process and the one-time exchange remains bounded by server expiry.
- [Error normalization hides useful diagnostics] → Preserve only stable stage/category metadata for future privacy-safe observability, never raw values.

## Migration Plan

1. Change the Main-only login port and focused tests.
2. Update callback lifecycle and error normalization.
3. Update App recovery copy and packaged callback verification.
4. Deploy the MySQL-compatible Account actor lookup and verify every protected bootstrap collection against production.
5. Build a signed App and complete one real Google login. No stored-data migration is required.

Rollback restores the previous API but must not reintroduce the premature browser success page; if rollback is necessary, the browser should show only “returned to App” rather than success.

## Open Questions

The exact live failure category from the user's current attempt is intentionally not inferred from the generic Renderer message. The corrected transaction and bounded error projection will make the next attempt diagnosable without exposing secrets.
