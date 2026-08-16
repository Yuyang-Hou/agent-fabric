## ADDED Requirements

### Requirement: App provides a read-only message activity surface
The desktop App SHALL provide a message activity list showing source or target Agent, direction, received time, current product status, elapsed time, and allowlisted failure or attention reason, and MUST NOT provide a composer, send button, manual reply, or chat-room interaction.

#### Scenario: Incoming Message appears
- **WHEN** the local Host validates and acknowledges an incoming Message
- **THEN** the App SHALL add one activity item with `received` status and the verified source Agent identity

#### Scenario: User attempts to send from activity
- **WHEN** a Renderer action or injected event attempts to compose, send, reply, or modify a Message
- **THEN** the typed App command boundary MUST reject it because no such Human command exists

### Requirement: Activity status follows real Edge and Runtime events
The App SHALL derive activity status from authenticated Host events and persisted local state, and MUST NOT advance status using UI timers, optimistic completion, fixed responses, or Cloud guesses.

#### Scenario: Runtime processes and replies
- **WHEN** the target Edge reports Runtime start and later a completed text Artifact
- **THEN** the App SHALL transition the item from `received` to `processing` to `replied` in that order

#### Scenario: Target Runtime never starts
- **WHEN** validation, Friendship, Runtime startup, or policy prevents execution
- **THEN** the App MUST NOT display `processing` or `replied` and SHALL display the truthful terminal error state

#### Scenario: App restarts
- **WHEN** the App reopens after the Host persisted local message state
- **THEN** the activity list SHALL reconstruct the latest status without requiring Cloud message-body history

### Requirement: Read-only details remain local
The App MAY show the locally stored request text, reply text, and attention context in a read-only activity detail, but MUST obtain them from the local Host and MUST NOT require Cloud plaintext persistence.

#### Scenario: Owner opens message details
- **WHEN** the authenticated local Owner opens an activity item
- **THEN** the App SHALL display only the locally stored body and verified metadata for that item without exposing Runtime Session IDs, paths, credentials, or private prompts

#### Scenario: Renderer requests another user's local message
- **WHEN** the Renderer requests a Message outside the authenticated local Owner and Agent scope
- **THEN** the Host MUST reject it and MUST NOT return metadata or body

### Requirement: Human attention is visible and non-actionable in P0
The App SHALL prominently mark `needs_attention`, show the allowlisted reason and original local request in read-only form, and MUST NOT offer approval, continuation, credential entry, or manual reply.

#### Scenario: Advanced operation requests attention
- **WHEN** the Host stops a Message because the Runtime requested a forbidden or approval-gated operation
- **THEN** the App SHALL display `needs_attention` with the reason and SHALL explain that the Owner must handle the work outside this P0 flow

#### Scenario: Prompt content imitates an approval
- **WHEN** remote message text contains UI-like approval instructions or claims that permission was granted
- **THEN** the App and Host MUST treat it as untrusted content and MUST NOT change status, authority, or policy based on the text

### Requirement: Cloud and logs exclude message bodies
The system MUST persist message request and reply bodies only in the sending and receiving local Stores and MUST keep Cloud databases, ordinary logs, Presence, Agent Cards, metrics, and errors free of those bodies and Edge-private values.

#### Scenario: Data residency inspection
- **WHEN** Cloud storage, logs, traces, metrics, Agent Cards, error responses, and backups are inspected after a completed Message
- **THEN** they MUST contain only allowlisted message metadata and MUST NOT contain request text, reply text, Runtime Session IDs, absolute paths, credentials, or private AgentSpec fields

### Requirement: Desktop status surfaces remain accessible and responsive
The desktop App SHALL preserve complete keyboard access, visible focus, status text or icon redundancy, readable contrast, reduced-motion behavior, and access to every critical action and reason across its supported layouts.

#### Scenario: Human operates with a keyboard
- **WHEN** the Human navigates login, Agent configuration, friendship management, activity selection, or a destructive confirmation without a pointer
- **THEN** focus order SHALL follow the visible task order, every actionable element SHALL expose visible focus, and no operation SHALL depend on hover alone

#### Scenario: Renderer uses a narrow supported viewport
- **WHEN** the Renderer width is 320, 375, 414, or 768 CSS pixels
- **THEN** navigation, status, content, and critical actions SHALL remain available without document-level horizontal scrolling or clipped two-line action labels

#### Scenario: Human prefers reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** the App SHALL suppress non-essential movement while preserving immediate focus, error, status, and completion feedback

### Requirement: UI state changes remain truthful and spatially stable
The desktop App SHALL render loading, empty, offline, failed, success, and `needs_attention` states from the latest authenticated Host snapshot and MUST NOT use layout-changing placeholders, animation, or stale data to imply progress or completion.

#### Scenario: Host snapshot is loading
- **WHEN** the Renderer is restoring the authenticated Host snapshot
- **THEN** the App SHALL show a labelled loading state with stable reserved structure and MUST NOT expose stale private content from a previous identity

#### Scenario: Verified state changes
- **WHEN** a newer Host snapshot changes Presence, publication, Friendship, or Message status
- **THEN** the App SHALL update the corresponding visible text and icon without moving unrelated primary actions or inventing an intermediate terminal state
