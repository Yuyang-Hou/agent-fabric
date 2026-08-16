## 1. Freeze and test the login transaction

- [x] 1.1 Validate the P0 OpenSpec strictly and register it as the active incremental authentication fix without disturbing concurrent first-use work.
- [x] 1.2 Add callback tests proving browser success waits for exchange, secure persistence and Account activation.
- [x] 1.3 Add failure/isolation tests for wrong state, duplicate callback, cancellation, timeout, exchange failure, vault failure and invalid Account bootstrap.

## 2. Implement truthful completion

- [x] 2.1 Refactor the Main-only Google login port so the authentication orchestrator owns final activation before browser completion.
- [x] 2.2 Make the loopback listener one-shot, time-bounded and deterministic, with secure success/failure response headers and no sensitive output.
- [x] 2.3 Normalize login-stage failures to allowlisted codes and clear newly stored credentials on every activation failure.
- [x] 2.4 Update Desktop login recovery copy for cancellation, timeout, exchange, session, secure-storage and network categories.
- [ ] 2.5 Keep browser completion pending through Host collection hydration, reject Cloud deployments that do not advertise `account-agents`, and bound Runtime/MCP startup without blocking Account entry.
- [x] 2.6 Split optional self-test authorization out of the production MySQL Account actor locking query and cover ordinary/self-test paths with persistence tests.

## 3. Verify the shipped path

- [x] 3.1 Run focused Desktop login, authentication, Host and Renderer tests plus typecheck/lint and strict OpenSpec validation.
- [ ] 3.2 Extend packaged-product verification to reject premature success and sensitive callback/Renderer output.
- [ ] 3.3 Build the signed App and verify packaged Renderer/login callback behavior without changing unrelated concurrent files.
- [ ] 3.4 Complete one real Google login against the production Account API, recording only bounded stage/category evidence.
- [ ] 3.5 Update Changelog/evidence, commit the isolated fix and push the current development branch to personal GitHub without modifying the company remote.
