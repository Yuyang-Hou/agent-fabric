## Why

The Desktop loopback callback currently tells the browser that login was returned before the App has proven server-side code exchange, session validation and secure credential persistence. Users repeatedly see a browser success message while the App remains signed out, making the product unusable and the failure misleading.

## What Changes

- Make the loopback callback an authenticated one-shot handoff whose browser result reflects the final Desktop login outcome rather than callback receipt alone.
- Complete Google code exchange, current Account session validation and secure credential persistence before the App transitions to signed in.
- Return bounded, actionable failure categories for state mismatch, callback expiry, exchange failure, invalid session and secure-storage failure without exposing OAuth or credential material.
- Keep the callback listener alive until the final outcome page is delivered, then close it deterministically; reject duplicate, stale and unsolicited callbacks.
- Add focused Desktop/Server contract tests and packaged-App regression coverage for success, retry, cancellation and failure.

Explicit non-goals: changing Google as the identity provider, adding password/OTP login, exposing OAuth material to Renderer, changing Account membership rules, or adding an A2A/Runtime capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-authentication`: Successful login now requires completed code exchange, validated Account session and durable secure credential persistence; callback receipt alone is not success.
- `multica-aligned-product-ui`: Browser callback and Desktop login surfaces must report the same truthful final outcome and bounded recovery action.

## Impact

- Product UI: signed-out progress/error semantics and browser completion copy.
- Desktop Main/Host: Google loopback listener, OAuth completion orchestration, credential vault and lifecycle handoff.
- Control Plane: existing Google exchange/session endpoints are verified and may receive bounded error normalization; no new identity authority is introduced.
- A2A, Edge Host and Runtime Adapter: unaffected.
- Security: OAuth code, state, PKCE, tokens and raw provider/server errors remain outside Renderer, logs and MCP.
