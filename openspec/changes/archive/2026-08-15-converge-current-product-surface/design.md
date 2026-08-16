## Context

The Account Agents vertical slice is the current product, but the repository and signed Desktop still compile or package several superseded product paths: Personal Agent/Friends, Messenger/Matrix, Atlas/ContextCapsule publication, and Revision/Deployment CLI workflows. The current default-product verifier scans only declared source roots, while the Desktop builder separately bundles an Atlas CLI and a broad Edge utility worker. Root project references and release gates also keep historical packages and Matrix requirements in the normal development path.

The cleanup must preserve the working Account product, standard A2A v1.0.1, MySQL data, Google login, safe credential storage, Runtime Adapter isolation, account-scoped MCP and redacted real-chain observability. Historical evidence remains useful, but it must not be an executable product surface or active task source.

## Goals / Non-Goals

**Goals:**

- Make `multica-aligned-agents-product` the only active product target after this supporting cleanup is archived.
- Ensure the signed Desktop and downloadable client expose only Account login/diagnostics, Agents/Runtimes/Members, the Account Edge Host, four-tool MCP and isolated Account self-test.
- Remove superseded product packages and commands from default workspace dependencies, tests, gates, SBOM and release artifacts.
- Make gates inspect what is actually built and packaged.
- Keep historical plans and evidence readable without allowing their incomplete tasks to appear active.

**Non-Goals:**

- No UI redesign, new Agent feature, new MCP tool or A2A extension.
- No weakening of authorization, revocation, sensitive-data or Runtime isolation tests.
- No claim of real multi-user acceptance without another authorized Account member and a real bound Runtime.
- No destructive rewrite of published Git history or previously released artifacts.

## Decisions

### 1. Archive superseded changes without syncing specs

Use OpenSpec's archive operation with `--skip-specs` for superseded changes. Their deltas describe abandoned product models and MUST NOT enter main specs. Completed reusable changes may also be archived normally only when their requirements remain current; this cleanup does not rewrite their evidence.

Alternative considered: check every remaining historical task as complete. Rejected because it would falsely claim unimplemented work and keep obsolete deltas looking current.

### 2. Separate current executables from historical compatibility

The Desktop build SHALL stop producing the Atlas CLI and SHALL bundle an Account Runtime worker whose request union contains only detection, account runtime execution/cancellation and shutdown operations required by the current host. Context publication, room publication and Personal Agent management commands are removed from the shipped protocol, not merely guarded by environment flags.

The downloadable CLI SHALL retain `setup`, `login`, `logout`, `doctor`, `agents list`, `ask`, `task get` and `self-test`. Hidden `join`, `publish`, `invite`, Revision/Deployment and ContextCapsule paths are removed. Desktop continues to install the independent four-tool MCP automatically.

Alternative considered: retain disabled compatibility flags. Rejected because disabled code is still compiled, packaged, tested, documented and supportable, and the user explicitly removed compatibility as a product requirement.

### 3. Preserve primitives, remove product-model dependencies

Google browser login, safe credential storage, app lifecycle, standard A2A client code, Runtime Adapter, cancellation, policy and leakage guards are retained. Active Desktop primitives move from `personal-agent/` to Account-neutral locations. MySQL migrations may retain old tables for safe deployed-schema compatibility, but current store interfaces and package dependencies SHALL not require the Personal Agent domain to operate the Account product.

Historical source that cannot be removed safely in one pass is moved outside the default TypeScript project/workspace graph and labeled read-only. It cannot be imported by a current executable.

### 4. Gates follow the built artifact

The default-product manifest will list allowed executables and workspace packages. Verification will inspect root project references, package dependencies, build entry points, client command surface and packaged Desktop resources. A forbidden marker in any reachable current entry point fails the gate even if it lives outside a declared feature directory.

The Matrix commercial gate moves with the archived Messenger product and no longer blocks Account Agents releases. Current release gates remain source policy, package boundaries, SBOM, final App/DMG verification, notarization, stapling, Gatekeeper and quarantine first launch.

### 5. Current architecture is normative; future architecture is archived research

`ARCHITECTURE.md`, `AGENTS.md`, README and current product docs SHALL contain only current Account Agents rules plus long-lived privacy/A2A/Runtime boundaries. AgentSpec/Revision/Deployment, Colleague Mesh, Matrix and publication research moves to explicitly historical documentation with no current task language.

### 6. Trust and data boundaries remain unchanged

Cloud continues to hold Account control-plane state and bounded A2A task metadata; it does not run Owner Agents or receive Runtime session IDs, cwd, model credentials or private Runtime context. The Edge retains local execution, write-only secrets and Runtime handles. Removing old code must reduce, not widen, credentials and network paths. Failures remain stable and redacted.

## Risks / Trade-offs

- [A legacy deployment still calls removed Personal Agent routes] → confirm production has the compatibility flag disabled and no active legacy tunnel before server removal; otherwise keep database rows but return explicit gone/not-supported behavior for one release.
- [Removing broad Edge exports breaks current imports] → derive the current entry-point graph first, move reusable primitives, and use contract tests before deleting packages.
- [Historical security tests disappear with old packages] → port product-neutral authorization, cancellation and leakage scenarios to current Account/A2A/Runtime tests before removing their old harness.
- [Default-product gate becomes a brittle filename allowlist] → verify semantic entry points and dependency reachability, while allowing declared build assets and generated SBOM files.
- [Previously signed beta still contains old executables] → do not rewrite it; record cleanup in the next Changelog and verify the next DMG from final contents.

## Migration Plan

1. Archive superseded OpenSpec changes with no spec sync; update authority docs and current validation commands.
2. Add artifact/dependency surface tests that initially identify the old entry points.
3. Remove Atlas/context publication and Personal/Messenger compatibility from Desktop/Edge/CLI/Server current entries.
4. Narrow workspace references, dependencies, source/package boundaries, release gates and documentation.
5. Rebuild the client and Desktop, inspect packaged resources, regenerate SBOM and run all current gates.
6. Run the automated Account self-test against an accessible online Agent. Complete multi-member acceptance only with real authorized participants.

Rollback is a normal Git revert of this cleanup before a new release. Database migrations are not rolled back or destructively dropped in this change.

## Open Questions

- Whether deployed legacy database tables can be physically removed is deferred until production usage is inspected; they may remain inert without keeping legacy executables or APIs.
- Final Multica parity approval remains a product decision after real acceptance, not an automated cleanup result.
