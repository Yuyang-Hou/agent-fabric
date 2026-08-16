## ADDED Requirements

### Requirement: Mandatory end-to-end encrypted room
Every Messenger room SHALL enable end-to-end encryption before accepting content, MUST use a vetted Matrix crypto implementation inside a main-managed isolated Crypto Worker/WebContents with persistent IndexedDB, and MUST fail closed rather than fall back to plaintext or ephemeral crypto storage.

#### Scenario: Create an encrypted room
- **WHEN** two active contacts create their first shared room and both devices initialize crypto successfully
- **THEN** the room accepts encrypted content and each verified device can decrypt authorized messages

#### Scenario: Crypto initialization fails
- **WHEN** the client cannot initialize its crypto store, device keys, or encrypted-room state
- **THEN** the room sends no content and presents a recoverable security error without plaintext fallback

#### Scenario: Isolated Crypto Worker is unavailable
- **WHEN** the main-managed Crypto Worker fails to start, crashes, navigates, loses source authentication, cannot open its persistent IndexedDB, or conflicts with another instance for the same Matrix Device/Store
- **THEN** main stops Matrix sync and sending, exposes no keys or room plaintext to the ordinary Renderer, and presents a recoverable security error without switching to an in-memory store

### Requirement: Isolated crypto process boundary
The Electron main process SHALL exclusively manage the lifecycle and authenticated command channel of one non-navigable, Node-disabled Crypto Worker/WebContents per Matrix Device/Store, and the ordinary Renderer MUST NOT directly access the Matrix Client, Rust Crypto, device keys, persistent IndexedDB, access token, or decrypted room store.

#### Scenario: Ordinary Renderer requests Matrix internals
- **WHEN** ordinary Renderer code requests a Matrix access token, crypto key, IndexedDB handle, raw Matrix Client, or unrestricted Worker command
- **THEN** the typed IPC boundary rejects the request and returns only an allowlisted UI projection or user-intent result

#### Scenario: Main replaces a Crypto Worker
- **WHEN** main restarts or replaces the Worker for a Matrix Device/Store
- **THEN** it closes the previous owner, waits for Store ownership release, creates exactly one authenticated replacement, and restores encrypted sync from persistent state

### Requirement: Four-party room projection
The UI SHALL represent exactly two Human participants and at most one attached Agent per Human in the MVP, and every Agent-originated event MUST identify both the Human sender device and independently verified Agent Principal.

#### Scenario: Both humans attach an Agent
- **WHEN** each human explicitly attaches one authorized local Agent to the room
- **THEN** the room displays four distinguishable participants with Human, Agent, Owner, revision, and availability provenance

#### Scenario: Forged Agent identity
- **WHEN** an encrypted event claims an Agent identity whose signature, Owner, revision, or room authorization cannot be verified
- **THEN** the client rejects it as Agent output, does not execute it, and presents no forged identity as trusted

### Requirement: Offline encrypted delivery
The message plane SHALL store only encrypted room events for offline recipients and SHALL deliver them after a verified device reconnects without requiring the server to decrypt content.

#### Scenario: Recipient reconnects
- **WHEN** a verified recipient device reconnects after encrypted messages or task requests were queued
- **THEN** it decrypts and processes authorized events in room order with idempotent duplicate handling

#### Scenario: Unverified device requests history
- **WHEN** a newly logged-in but unverified device requests encrypted history without approved key recovery
- **THEN** the client does not expose decrypted content and requests human device verification or recovery

### Requirement: Minimal server-visible data
The Matrix server and Agent Fabric Control Plane MUST NOT receive room plaintext, Artifact plaintext, model credentials, absolute paths, Runtime session identifiers, private AgentSpec, or hidden reasoning.

#### Scenario: Server-state leakage scan
- **WHEN** stored events, Control Plane records, logs, errors, analytics, and network fixtures are scanned after a complete task
- **THEN** only ciphertext and allowlisted routing/governance metadata are present and prohibited Edge-private values are absent
