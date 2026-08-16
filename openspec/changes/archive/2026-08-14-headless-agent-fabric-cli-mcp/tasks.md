## 1. Contract and module baseline

- [x] 1.1 Reconcile this change with `agent-fabric-v1-foundation`, mark the Messenger task list as paused without deleting its evidence, and add dependency-boundary tests for the new target modules.
- [x] 1.2 Define versioned schemas for ContextCapsule, public Revision projection, credentials/scopes, Grant, Deployment presence, tunnel envelope, backup manifest, and component compatibility handshake.
- [x] 1.3 Register all new production dependencies and container base images in `config/third-party-sources.json`, then pass source-policy and license checks.
- [x] 1.4 Add shared contract fixtures for success, failure, isolation, cancellation, revocation, offline, compatibility, and sensitive-data leakage cases.

## 2. Context publication and isolated Edge runtime

- [x] 2.1 Implement ContextCapsule validation, bounded redaction, disclosure summary, content hashing, and immutable local Revision storage with unit tests.
- [x] 2.2 Implement the `(Revision, Requester, contextId)` Session Manager and successor reconstruction using the Fake Runtime contract suite.
- [x] 2.3 Add Runtime/Skill/MCP capability inspection and the Revision × Grant × local-policy intersection, including capability reduction and non-expansion tests.
- [x] 2.4 Implement durable Edge task intake, idempotency, cancel tombstones, revocation versions, and crash/restart tests.
- [x] 2.5 Package Edge as a user-level headless service with install/start/stop/status/log discovery on the supported development platform.

## 3. PostgreSQL control plane

- [x] 3.1 Implement PostgreSQL repositories and migrations for instance, Principal, Device, Agent, public Revision, Deployment, Grant, Presence, Task projection, idempotency, and allowlisted audit metadata.
- [x] 3.2 Implement one-time instance bootstrap, administrator/device enrollment, scoped credential issuance, rotation, expiry, revocation, and audience validation.
- [x] 3.3 Implement Agent registration, owner-scoped discovery, public Agent Card projection, Deployment presence, and private-field rejection tests.
- [x] 3.4 Implement human-authorized Grant creation/revocation and request-time scope, expiry, budget, and revocation-race enforcement.
- [ ] 3.5 Add repository and API leakage tests proving that message bodies, Artifact bodies, capsules, paths, Runtime handles, and secrets are not persisted or logged.
- [ ] 3.6 Implement the optional MySQL repository and migration adapter, select it only through explicit configuration, and pass the shared persistence/privacy contract suite against both database backends. (Adapter, MySQL 5.7 migration, explicit driver selection, provider JDBC normalization, and static privacy tests are implemented; live shared-backend acceptance remains pending.)
- [x] 3.7 Return one routable discovery projection per Agent Revision with the effective Grant ID, intersected capability scope, and freshest online Deployment in both PostgreSQL and MySQL.

## 4. A2A Gateway and Edge tunnel

- [x] 4.1 Implement pinned A2A v1.0.1 Agent Card, Send Message, Get/List/Cancel Task HTTP endpoints and conformance fixtures without private A2A fields.
- [x] 4.2 Implement authenticated outbound Edge WebSocket registration, heartbeat, compatibility handshake, replacement, reconnect, and truthful online/offline presence.
- [x] 4.3 Implement authorized Task routing and verified Edge event projection for synchronous and asynchronous execution.
- [ ] 4.4 Implement stale-channel, duplicate-delivery, disconnect, cancellation, revocation, and unavailable-Agent integration tests.
- [ ] 4.5 Verify bounded in-memory body forwarding and crash recovery using metadata only.

## 5. CLI and shared client

- [x] 5.1 Implement the typed Control Plane/A2A Client SDK with stable domain errors, retries, compatibility checks, and credential-scope separation.
- [x] 5.2 Implement guided `setup`, `login/logout`, and Edge install/start/stop/status/logs/doctor commands with atomic configuration writes.
- [ ] 5.3 Implement `publish`, `list/show`, and Revision update commands using local Edge and ContextCapsule inputs.
- [ ] 5.4 Implement interactive `grant` and `revoke` commands that display target, capability, expiry, budget, and impact before human confirmation.
- [ ] 5.5 Implement Agent discovery, ask, delegate, task get/list/cancel, and context continuation commands.
- [ ] 5.6 Add versioned JSON output schemas, stable exit-code classes, redacted human output, and golden CLI tests for every command group.

## 6. Codex Plugin and MCP Server

- [x] 6.1 Create the Codex Plugin manifest and install layout with a publication Skill and an Agent invocation Skill that invoke only supported CLI/MCP contracts.
- [x] 6.2 Implement MCP tools for `find_agent`, `ask_agent`, `delegate_task`, `get_task`, context continuation, and cancellation on the shared Client SDK.
- [x] 6.3 Prove MCP and ordinary Agent credentials cannot publish external Grants, access Owner capsules, or call administrator operations.
- [ ] 6.4 Add Plugin installation, setup rollback, current-visible-context publication, requester conversation return, and uninstall-preserves-unrelated-config acceptance tests.
- [x] 6.5 Remove the standalone Codex CLI prerequisite by atomically managing the Agent Fabric MCP table in shared Codex Host config, binding STDIO to the installer's absolute Node executable instead of the Desktop `PATH`, independently installing Skills, and covering absent-CLI, split-Node-environment, idempotency, preservation, malformed-config, and rollback cases. (Evidence: 13 focused CLI tests, full 171 unit + 43 contract tests, and final `.tgz` MCP initialize acceptance with both `codex` and `node` absent from `PATH`.)

## 7. Self-hosted server distribution

- [ ] 7.1 Build a non-root multi-architecture `agent-fabric-server` OCI image with pinned runtime/base provenance and startup entrypoints for serve, migrate, backup, restore, and doctor.
- [ ] 7.2 Add version-pinned Compose for Server and PostgreSQL, `.env.example`, persistent volumes, migration job, health checks, and a loopback-only default profile.
- [x] 7.3 Add an optional Caddy TLS profile plus external reverse-proxy configuration, canonical-origin checks, and insecure-public-startup rejection tests.
- [ ] 7.4 Implement migration locking, Schema compatibility checks, pre-upgrade backup enforcement for destructive migrations, and rollback documentation/tests.
- [ ] 7.5 Implement backup archive creation/verification and empty-instance restore with manifest, logical database dump, non-secret configuration, checksums, and consistency checks.
- [ ] 7.6 Implement versioned governance export/import and tests for bundled-to-external PostgreSQL and old-machine-to-new-machine migration.
- [ ] 7.7 Run fresh-machine Compose installation, restart persistence, compatible upgrade, corrupt-backup rejection, full restore, and incompatible-client acceptance scenarios.
- [ ] 7.8 Deploy the same Server image against a managed MySQL resource and verify migration, restart persistence, readiness, and API parity without changing the default PostgreSQL Compose path.

## 8. End-to-end product and security acceptance

- [ ] 8.1 Run a local two-identity Fake Runtime flow covering publish, Owner-only access, human grant, discovery, ask, follow-up, delegate, cancel, offline, reconnect, and revoke.
- [ ] 8.2 Run a two-machine/two-user Codex flow proving the Requester asks Atlas and receives results in their own Codex while Electron remains absent and Codex Desktop may be closed on the Owner machine.
- [ ] 8.3 Run cross-Requester/context/Revision isolation tests and inspect Server database, backups, logs, Agent Cards, tunnel metadata, and telemetry for prohibited data.
- [ ] 8.4 Document the one-command local deployment, public deployment, client setup, publish/share flow, upgrade, backup, restore, migration, troubleshooting, and honest privacy limits.
- [ ] 8.5 Run all unit, contract, integration, A2A conformance, OpenSpec strict validation, foundation validation, and commercial-alpha release gates; attach reproducible evidence before marking the change complete.
