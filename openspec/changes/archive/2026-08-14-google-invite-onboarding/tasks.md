## 1. Contracts and persistence

- [x] 1.1 Define invitation, join-session, exchange, external-identity, and redacted response contracts with validation tests.
- [x] 1.2 Add backward-compatible PostgreSQL and MySQL migrations plus repository operations for atomic invitation redemption.
- [x] 1.3 Add shared persistence tests for success, expiry, revocation, concurrent replay, rollback, and prohibited-secret leakage.

## 2. Server OIDC and onboarding API

- [x] 2.1 Add optional fail-closed Google OAuth configuration and feature reporting tests.
- [x] 2.2 Implement the OIDC provider port, Google Authorization Code/JWKS adapter, state/nonce/claim validation, and Fake Provider tests.
- [x] 2.3 Implement owner invitation creation/revocation, join start/callback, loopback validation, PKCE exchange, and bounded error responses.
- [x] 2.4 Add API contract and log/audit leakage tests covering tampering, timeout, replay, identity reuse, and per-device isolation.

## 3. CLI and MCP integration

- [x] 3.1 Add typed client methods for invitations and unauthenticated join/exchange operations with stable domain errors.
- [x] 3.2 Implement `invite`, `join`, loopback callback, browser launch, timeout/cancel behavior, and atomic joined configuration.
- [x] 3.3 Make the MCP server read the private CLI config and default routing fields without copying the Device Token.
- [x] 3.4 Implement `mcp install` through `codex mcp`, conflict-safe retry behavior, a self-contained installable client package, and CLI golden tests.

## 4. Verification and deployment

- [x] 4.1 Update portable deployment environment documentation and register any new production sources.
- [x] 4.2 Run unit, contract, policy, boundary, source, build, and strict OpenSpec validations.
- [x] 4.3 Commit with fct, synchronize `deploy-test`, configure Google OAuth secrets, and verify managed MySQL migration/readiness.
- [x] 4.4 Run live invitation, Google test-user join, MCP discovery/ask, replay rejection, and revocation acceptance without exposing secrets.
- [x] 4.5 Return to the development branch and update the authoritative Agent Fabric work item with evidence and the next action.
