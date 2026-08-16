## ADDED Requirements

### Requirement: Browser and Desktop login outcomes remain truthful
The signed-out product SHALL present one consistent final login outcome across the system browser and Desktop. Callback receipt MAY be described as processing or returned to the App, but MUST NOT be described as successful authentication before Account activation completes.

#### Scenario: Login is still activating
- **WHEN** the loopback callback has arrived but code exchange, secure storage or Account bootstrap is still pending
- **THEN** neither surface claims success and duplicate Google actions remain disabled

#### Scenario: Login completes
- **WHEN** the complete activation transaction succeeds
- **THEN** the browser says login completed and the Desktop opens the signed-in Account product

#### Scenario: Login fails after callback
- **WHEN** any required activation stage fails after callback receipt
- **THEN** the browser shows a bounded failure outcome and the Desktop shows a specific retry or recovery message for the allowlisted category
