## 1. Freeze superseded authority

- [x] 1.1 Archive superseded foundation, Messenger, headless and Personal Agent changes with no spec sync, preserving their artifacts as read-only history.
- [x] 1.2 Update `openspec/CURRENT.md`, `AGENTS.md`, README and current validation commands so only the Account Agents authority and supporting convergence change drive work.
- [x] 1.3 Replace conflicting current sections of `ARCHITECTURE.md` and move AgentSpec/Revision/Deployment, Matrix, Messenger, Atlas and Colleague Mesh material behind an explicit historical/future boundary.

## 2. Remove superseded shipped surfaces

- [x] 2.1 Remove the Atlas CLI/bin and broad legacy Utility Worker from the Desktop build and prove packaged resources contain only current Account MCP and Codex Runtime executables.
- [x] 2.2 Remove ContextCapsule, Revision/Deployment, join/publish/invite and legacy service-management commands from the downloadable Account CLI while preserving setup/login/logout/doctor/list/ask/get/self-test.
- [x] 2.3 Remove default Server and Edge registrations for Personal Agent/Friends compatibility, including the compatibility environment flag and legacy tunnel route, without destructively dropping historical database data.
- [x] 2.4 Move retained Desktop Google login, credential-vault, lifecycle and server-origin primitives to Account-neutral modules and update focused tests.

## 3. Converge dependency and verification graphs

- [x] 3.1 Remove Matrix/Messenger/Personal/ContextCapsule dependencies from current Desktop, Server, Edge, MySQL and CLI package graphs where they are no longer reachable.
- [x] 3.2 Narrow root build/typecheck/lint/test project references to the current product and reusable A2A/Runtime/security packages; retain historical source outside default execution.
- [x] 3.3 Replace the Matrix commercial gate with current Account Agents release gates and update release documentation/evidence.
- [x] 3.4 Strengthen default-product and packaged-product tests to inspect build entry points, package dependency edges, CLI commands and final resource manifests for forbidden historical surfaces.
- [x] 3.5 Regenerate SBOM/NOTICE and add a user-visible Changelog entry for removal of obsolete product surfaces.

## 4. Verification and acceptance

- [x] 4.1 Run strict validation for this change and the current authority, plus focused CLI, Server, Edge, MCP, Desktop and package-surface tests.
- [x] 4.2 Run the full current-product build, lint, typecheck, unit/contract, source, boundary, default-product, client-distribution, packaged-product, SBOM and development release gates.
- [x] 4.3 Build the next Desktop artifact and verify its resources contain no Atlas, Personal Agent, Messenger/Matrix, ContextCapsule, Revision or Deployment executable surface.
- [ ] 4.4 Run the automated isolated Account self-test against a selected accessible online Agent, proving real MCP discovery, A2A answer, Task read, cleanup and post-revocation denial.
- [x] 4.5 Record any remaining human-only multi-member/Runtime and Multica parity acceptance as the only blocker, then commit and push the complete convergence branch to the personal GitHub remote without modifying the company remote.

> Remaining acceptance: 4.4 requires an interactive Google login to the current Account, selection of an accessible online Agent, and a second non-owner member. Repository fixtures and stale local credentials are not accepted as proof.
