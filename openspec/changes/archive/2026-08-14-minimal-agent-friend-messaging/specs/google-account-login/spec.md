## ADDED Requirements

### Requirement: Google login establishes the Human account
The desktop App SHALL authenticate a Human through Google OAuth Authorization Code with PKCE in the system browser and SHALL establish the Agent Fabric Human Account only after the server validates the callback, issuer, audience, state, nonce, and PKCE verifier.

#### Scenario: Successful Google login
- **WHEN** an unauthenticated user completes a valid Google authorization flow from the desktop App
- **THEN** the App SHALL enter the authenticated state for the matching Human Account without exposing the Google authorization code or tokens to the Renderer

#### Scenario: Replayed or mismatched callback
- **WHEN** a callback has an invalid state, nonce, redirect binding, PKCE verifier, audience, or previously consumed authorization result
- **THEN** the system MUST reject the login without creating an App Session, Device, or Agent

### Requirement: Device credentials are independent from Google and Agent credentials
The system SHALL exchange a successful Human login for a separately scoped Device Credential, SHALL store it in the operating-system credential store, and MUST NOT reuse a Google Token as an Edge, Agent, or MCP credential.

#### Scenario: Register the current Mac
- **WHEN** an authenticated Human registers a new supported Mac
- **THEN** the system SHALL create a Device owned by that Human and store only the resulting scoped Device Credential in the system credential store

#### Scenario: MCP attempts to read management credentials
- **WHEN** the MCP process requests the Google Token, App Session, Device management credential, or friendship management port
- **THEN** the local Host MUST deny the request and MUST NOT disclose the credential through output, environment, logs, or tool results

### Requirement: Logout revokes the local authenticated session
The App SHALL provide logout that revokes the App Session, removes local session material, and disconnects the Device from authenticated management operations without deleting unrelated local AI configuration.

#### Scenario: Successful logout
- **WHEN** the Human explicitly logs out
- **THEN** the App SHALL return to the login screen, the management session SHALL become unusable, and the Renderer SHALL no longer receive private Agent or friendship data

#### Scenario: Revoked session is reused
- **WHEN** a revoked or expired App Session is presented to the Control Plane
- **THEN** the Control Plane MUST reject it and MUST NOT silently refresh or downgrade authentication

### Requirement: Signed-out UI communicates the authentication and privacy boundary
The desktop App SHALL present one primary Google login action, SHALL explain that authentication completes in the system browser, and MUST NOT display signed-in Agent, friendship, message, or credential data before the local authenticated session is restored.

#### Scenario: Login is in progress
- **WHEN** the Human starts Google login and the system-browser flow has not completed
- **THEN** the App SHALL keep the login action visibly busy, MUST prevent duplicate login starts, and MUST NOT claim that a session or Device exists

#### Scenario: Login fails or is cancelled
- **WHEN** Google login is cancelled, rejected, expires, or returns an invalid callback
- **THEN** the App SHALL remain signed out, SHALL show an actionable error, and MUST NOT reveal stale private product data
