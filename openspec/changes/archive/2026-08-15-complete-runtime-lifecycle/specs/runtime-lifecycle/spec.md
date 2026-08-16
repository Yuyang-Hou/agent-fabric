## ADDED Requirements

### Requirement: Packaged Desktop resolves the installed Codex Runtime
The packaged Desktop SHALL resolve an executable Codex Runtime from an explicit Edge-only configuration, the executable PATH, or the supported ChatGPT application location, SHALL pass the resolved path only to the local Runtime Adapter process, and MUST NOT expose the path or authentication material to Cloud or Renderer.

#### Scenario: Logged-in ChatGPT is installed
- **WHEN** the supported ChatGPT application contains an executable Codex binary and the local account is authenticated
- **THEN** the packaged Desktop starts `codex-acp` with that binary and detection can reach a real authenticated Runtime

#### Scenario: Codex executable is missing
- **WHEN** no explicit, PATH or supported application candidate is executable
- **THEN** detection terminates as unavailable with bounded recovery guidance and no private path or raw spawn error leaves Edge

#### Scenario: Renderer inspects Runtime state
- **WHEN** Renderer receives the Runtime catalog or detail snapshot
- **THEN** the snapshot contains only bounded provider, adapter, health, capability and observation metadata and excludes executable paths, credentials, Codex Home, cwd and Runtime session IDs

### Requirement: Local Runtime refresh performs real bounded detection
The Desktop Main and Edge Host SHALL treat a refresh command as intent to perform real local Runtime detection, SHALL publish `checking` only as a transient state, and MUST converge within a bounded interval to `ready`, `auth_required`, `unavailable` or `offline` based on the Adapter result.

#### Scenario: Refresh succeeds
- **WHEN** an authorized user refreshes the Runtime owned by the active local Registration Service and the Adapter detects an authenticated usable Runtime
- **THEN** the system writes `checking`, performs `detect` and capability inspection, writes `ready` with the real bounded capability summary, and the Runtime becomes selectable in Agent creation

#### Scenario: Authentication is missing
- **WHEN** local detection reports that Codex authentication is required
- **THEN** the Runtime converges to `auth_required`, the UI shows a local login recovery action, and no credential field is rendered

#### Scenario: Detection fails or times out
- **WHEN** local detection throws, disconnects or exceeds its deadline
- **THEN** the Runtime converges to `unavailable` or `offline`, the refresh action becomes available again, and no record remains indefinitely in `checking`

### Requirement: Runtime refresh is serialized and device-bound
The Edge lifecycle coordinator SHALL allow at most one active detection for a local Runtime, SHALL coalesce concurrent refresh requests, and MUST reject attempts to control a Runtime not owned by the active local Registration Service.

#### Scenario: User clicks refresh repeatedly
- **WHEN** multiple refresh requests for the same local Runtime arrive before detection completes
- **THEN** exactly one Adapter detection and one checking-to-terminal observation sequence executes and all callers receive the same terminal projection

#### Scenario: User opens the same Runtime from two views
- **WHEN** list and detail views issue overlapping refresh intents for the same local Runtime
- **THEN** the Main process preserves one lifecycle operation and Renderer does not create a second Runtime process or tunnel

#### Scenario: Remote Runtime is refreshed
- **WHEN** the current device receives a refresh command for an Account Runtime not owned by its active local Registration Service
- **THEN** the command is rejected before detection with bounded “run detection on the Runtime device” guidance and the remote Runtime record is not changed to checking

### Requirement: Restart recovers stale checking state
The Account Runtime Registration Service SHALL use the same bounded detection path during signed-in startup and MUST replace a matching locally owned stale `checking` projection with the current real terminal result before declaring the local Runtime available.

#### Scenario: App restarts after interrupted refresh
- **WHEN** the matching locally owned Runtime is still `checking` when Desktop restores a valid session
- **THEN** Desktop performs one real detection, observes a terminal health state and restores the outbound Runtime tunnel only after registration reconciliation

#### Scenario: Tunnel startup fails after successful detection
- **WHEN** Adapter detection succeeds but the outbound Runtime tunnel cannot start
- **THEN** the Runtime converges to `offline` and is not selectable for new Agent bindings

#### Scenario: Another member owns the matching provider record
- **WHEN** startup lists a provider/adapter record owned by another Account member
- **THEN** the local Registration Service does not adopt, refresh or overwrite that Runtime

### Requirement: Renderer reflects lifecycle events without owning Runtime state
The Renderer SHALL issue validated refresh intent, SHALL receive checking and terminal projections through the existing Host snapshot and Account invalidation path, and MUST NOT call the Adapter, retain Runtime handles or infer success from the button action.

#### Scenario: Detection progresses to ready
- **WHEN** Control Plane observations change the local Runtime from checking to ready
- **THEN** the Runtime list, detail and Agent creation surfaces update without restarting the Renderer and only the ready Runtime appears in the binding selector

#### Scenario: Detection returns a failure terminal state
- **WHEN** the Runtime becomes auth_required, unavailable or offline
- **THEN** the UI removes it from bindable choices, stops the loading state and shows the matching bounded recovery message

#### Scenario: Raw Adapter failure contains private data
- **WHEN** a Runtime failure includes an absolute path, credential fragment, cwd or private configuration value
- **THEN** logs, Control Plane events and Renderer snapshots contain only an allowlisted failure class and no private value

### Requirement: Runtime lifecycle acceptance verifies the shipped interaction path
Completion evidence SHALL cover Fake Runtime lifecycle contracts, Desktop Host and IPC behavior, packaged Codex path resolution, a real built App interaction, and one real MCP-to-A2A terminal answer; fixture rendering, API acknowledgement, execution metadata without a readable result, or build success alone MUST NOT be treated as Runtime availability.

#### Scenario: Automated lifecycle acceptance runs
- **WHEN** the change is prepared for delivery
- **THEN** tests prove success, authentication-required, failure, timeout, concurrent refresh, remote isolation and restart recovery paths

#### Scenario: Real App acceptance runs
- **WHEN** the built Agent Fabric App is launched with a supported logged-in ChatGPT Runtime
- **THEN** a user can click refresh, observe a non-checking terminal state, open Agent creation and select the detected Runtime

#### Scenario: App remains checking or selector stays empty
- **WHEN** real App interaction does not reach a terminal healthy Runtime or the Runtime cannot be selected
- **THEN** the change remains incomplete regardless of passing builds, fixtures or service API tests

#### Scenario: Runtime heartbeat occurs during an A2A task
- **WHEN** Codex MCP sends a question and the bound Runtime publishes one or more heartbeat/version observations before the Task completes
- **THEN** the same Task remains readable through standard A2A, reaches a bounded terminal state, and returns its text Artifact without `agent-unavailable` or Task Store loss

#### Scenario: Execution completes but result cannot be read
- **WHEN** Edge reports a completed Task but the initiating MCP call or `get_task` cannot obtain the terminal Task within the bounded deadline
- **THEN** real-chain acceptance fails and the product MUST NOT report the Runtime lifecycle as complete

### Requirement: Existing Codex MCP sessions survive Desktop restart
The Codex-facing MCP Host SHALL treat the private configuration file as a rotatable local connection fact, SHALL load and validate the current loopback endpoint and token for each Gateway operation, and MUST NOT require the Codex process or conversation to restart after Desktop replaces that configuration.

#### Scenario: Desktop restarts while Codex remains open
- **WHEN** Desktop revokes the old loopback, starts a new loopback and atomically replaces the private MCP configuration file
- **THEN** the next MCP tool call from the already-running Codex MCP process uses the new endpoint and token and can list accessible Agents

#### Scenario: Configuration is temporarily unavailable
- **WHEN** an MCP tool call occurs between Desktop stopping the old loopback and publishing the new private configuration
- **THEN** that call fails with a bounded local-availability error, emits no endpoint or token, and a later call can recover without restarting the MCP process

### Requirement: Runtime tunnel recovers without stale lifecycle state
After its first successful connection, the local Runtime tunnel SHALL reconnect after an unexpected socket close or network error with bounded retry behavior, SHALL keep at most one active socket and reconnect timer, and MUST stop all retries, heartbeat work and execution resources after explicit shutdown.

#### Scenario: Established tunnel disconnects
- **WHEN** an established Runtime WebSocket closes unexpectedly while the Account session remains active
- **THEN** Edge clears the old heartbeat, reconnects with the same bounded Runtime identity and resumes heartbeats without restarting Desktop

#### Scenario: Registration service stops during backoff
- **WHEN** logout, session replacement or App shutdown stops the Runtime service while reconnect is pending
- **THEN** the timer is canceled, no later socket is opened and Adapter execution resources are shut down once

#### Scenario: Heartbeat races with a Runtime update
- **WHEN** a manual refresh or settings update increments the Runtime version before the next heartbeat observation
- **THEN** Cloud reads the latest Runtime projection, performs at most one bounded version-conflict retry, and later heartbeats continue even if one observation fails

### Requirement: Desktop event synchronization recovers after Cloud replacement
The Cloud SHALL emit bounded non-business heartbeat frames on an authenticated Account events connection, and Desktop MUST replace a connection that exceeds its liveness deadline so Agent activity and presence invalidations resume without login or App restart.

#### Scenario: Cloud instance is replaced behind a proxy
- **WHEN** the previous Account events connection stops delivering frames without producing a timely TCP close or error
- **THEN** Desktop expires that socket, reports reconnecting, creates exactly one replacement connection with bounded backoff and returns to online after the replacement opens

#### Scenario: Stale socket closes after replacement
- **WHEN** the expired socket emits a delayed close or error after a replacement socket has been created
- **THEN** Desktop ignores the stale event and keeps the replacement connection and its retry state intact

### Requirement: Transient Cloud failure does not revoke a restored local session
Desktop MUST clear an existing App session credential only when Cloud explicitly rejects that credential or the authenticated Account identity is inconsistent, and SHALL preserve the credential while stopping local session services for transient network, deployment, server or compatibility failures.

#### Scenario: App starts during a Cloud deployment
- **WHEN** protected bootstrap fails without a 401/403 authentication rejection
- **THEN** Desktop stops partial Runtime/MCP session services, retains the secure App session credential and reports bounded server-unavailable guidance so a later restore does not require Google login

#### Scenario: Restored credential is rejected
- **WHEN** Cloud returns an authentication or authorization rejection for the stored App session, or its session and Account identities disagree
- **THEN** Desktop stops local session services, clears the stored credential and presents the signed-out expired state

#### Scenario: Production MySQL loads protected bootstrap collections
- **WHEN** Desktop requests the bounded Agent, Runtime, member, invitation, draft or activity page after authentication
- **THEN** Cloud executes a MySQL-compatible bounded query, returns the collection without `Incorrect arguments`, and keeps all non-limit dynamic values parameterized
