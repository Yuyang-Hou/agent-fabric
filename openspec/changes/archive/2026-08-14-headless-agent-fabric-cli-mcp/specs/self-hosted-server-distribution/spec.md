## ADDED Requirements

### Requirement: Portable independent server distribution
Agent Fabric Server SHALL be distributed as a versioned multi-architecture OCI image with a version-pinned Docker Compose deployment that includes PostgreSQL. The same image SHALL support an explicitly selected MySQL persistence adapter for managed platforms. The image and required runtime behavior MUST NOT depend on a specific cloud vendor, hosted control plane, Electron application, or source checkout.

#### Scenario: Fresh machine starts the Server
- **WHEN** an operator installs a supported container runtime, provides the documented minimum configuration, and runs the one-command Compose startup
- **THEN** PostgreSQL, migrations, Server, and health checks reach ready state without building source code

#### Scenario: External PostgreSQL is used
- **WHEN** an operator supplies a supported external `DATABASE_URL`
- **THEN** the same Server image starts without the bundled database and retains identical API and migration behavior

#### Scenario: Managed MySQL is used
- **WHEN** an operator explicitly selects the MySQL driver and supplies either a standard MySQL URI or a provider-issued JDBC MySQL connection URL
- **THEN** the same Server image uses the MySQL adapter while retaining identical identity, authorization, Agent, Grant, Task, API, and privacy behavior

#### Scenario: Provider JDBC connection is normalized
- **WHEN** a managed platform exposes the MySQL username and password as JDBC query parameters
- **THEN** Server normalizes the connection in memory, removes Java-only pool parameters, and never logs or persists the source connection value

#### Scenario: Database driver is ambiguous or unsupported
- **WHEN** the configured driver is missing for a non-default topology, conflicts with the connection configuration, or is unsupported
- **THEN** startup fails before migrations or traffic and reports a non-secret configuration error

#### Scenario: Required secure configuration is missing
- **WHEN** a public deployment lacks a valid public base URL, TLS termination declaration, or strong required secret
- **THEN** the Server fails closed before accepting authentication or A2A traffic

### Requirement: Safe bootstrap and configuration
The distribution SHALL provide a documented environment schema, secret-file support, generated secure defaults where safe, and a one-time bootstrap flow for the first administrator. Bootstrap credentials MUST expire after use and MUST NOT be printed in ordinary logs or included in backups.

#### Scenario: Empty instance is initialized
- **WHEN** an operator uses a valid one-time bootstrap token against an uninitialized instance
- **THEN** exactly one initial administrator and instance identity are created and the token becomes unusable

#### Scenario: Bootstrap is replayed
- **WHEN** the consumed or expired token is submitted again
- **THEN** initialization is rejected without changing existing principals or configuration

#### Scenario: Configuration is inspected
- **WHEN** the operator runs the config validation or doctor command
- **THEN** it reports missing, deprecated, and insecure settings while redacting secret values

### Requirement: Transactional schema migration and version compatibility
Server SHALL version its database Schema and external protocol contract consistently across PostgreSQL and MySQL adapters. Startup MUST acquire a database-appropriate migration lock, reject unsupported forward or backward Schema versions, and become ready only after compatible migrations complete. CLI, Edge, and Server MUST negotiate supported major versions and feature flags.

#### Scenario: Compatible upgrade is started
- **WHEN** the database is on a supported prior Schema and the required pre-upgrade backup exists
- **THEN** migrations execute exactly once, preserve validated data, and Server becomes ready with the new version

#### Scenario: Two instances race to migrate
- **WHEN** multiple Server replicas start against the same database
- **THEN** only one holds the migration lock and others wait or fail safely without duplicate migration effects

#### Scenario: Persistence adapters diverge
- **WHEN** the PostgreSQL and MySQL adapters are checked against shared repository contract fixtures
- **THEN** both expose equivalent identity, authorization, registry, presence, task, idempotency, audit-allowlist, and privacy behavior

#### Scenario: Component major versions are incompatible
- **WHEN** CLI or Edge connects with an unsupported major protocol version
- **THEN** the connection is rejected with component versions and an explicit upgrade direction, without weakening authorization behavior

### Requirement: Health, readiness, and bounded observability
The Server image SHALL expose unauthenticated liveness and non-sensitive readiness endpoints plus authenticated detailed diagnostics. Logs and metrics MUST be structured, bounded, and free of prohibited message or Runtime content.

#### Scenario: Process is alive but database is unavailable
- **WHEN** the Server process runs while PostgreSQL or required migration state is unavailable
- **THEN** liveness remains truthful, readiness fails, and traffic is not accepted as healthy

#### Scenario: Operator diagnoses a deployment
- **WHEN** an authenticated operator runs the doctor command
- **THEN** it checks database, migrations, public URL, TLS declaration, storage, Edge compatibility, and queue/routing health without exposing secrets

### Requirement: Verified backup and restore
The distribution SHALL provide product commands to create and verify a portable backup archive containing a PostgreSQL logical backup, non-secret instance configuration, manifest, Schema/Server versions, and checksums. Restore MUST validate integrity and compatibility before modifying the destination.

#### Scenario: Operator backs up a running instance
- **WHEN** the operator runs backup with a writable destination and valid admin authority
- **THEN** the command creates a consistent archive, verifies its checksums, and reports its restore compatibility without stopping healthy traffic longer than the documented bound

#### Scenario: Backup is corrupt or incompatible
- **WHEN** restore receives an archive with invalid checksums, unsupported Schema, or mismatched instance policy
- **THEN** restore aborts before changing destination data and reports the exact compatibility failure

#### Scenario: New machine restores an instance
- **WHEN** an operator starts a compatible empty deployment and restores a valid archive
- **THEN** identities, Agent Cards, Grants, Deployments, task metadata, and instance settings pass consistency checks, while Edge devices are required to reconnect or re-authenticate as policy defines

### Requirement: Exportable governance data and deployment migration
Server SHALL provide versioned export/import for allowlisted governance data and SHALL document moving from bundled PostgreSQL to external PostgreSQL or another machine without changing Agent or Principal identities.

#### Scenario: Operator migrates deployment topology
- **WHEN** an operator exports or backs up the source and imports or restores into a compatible destination
- **THEN** stable instance, Principal, Agent, Revision projection, and Grant identifiers are preserved and clients can reconnect using the documented endpoint change flow

#### Scenario: Import references unknown private data
- **WHEN** an import contains ContextCapsules, credentials, Runtime handles, or fields outside the governance Schema
- **THEN** import rejects those records and does not create partial authorization state

### Requirement: Secure local and public deployment profiles
Compose SHALL provide a default local profile bound to loopback and an optional public TLS profile with a replaceable reverse proxy. Enabling the public profile MUST NOT change A2A, Control Plane, persistence, backup, or identity contracts.

#### Scenario: Developer starts the local profile
- **WHEN** no public profile is selected
- **THEN** service ports bind only to documented local interfaces and remain usable by local CLI/Edge acceptance tests

#### Scenario: Operator enables the public TLS profile
- **WHEN** a valid domain, public base URL, and TLS configuration are supplied
- **THEN** external CLI/Edge clients connect through HTTPS/WSS and Server-generated Agent Card URLs use that canonical origin

#### Scenario: Operator uses another reverse proxy
- **WHEN** the bundled TLS profile is disabled behind a supported external proxy
- **THEN** trusted proxy validation and canonical URL configuration preserve the same security and API behavior
