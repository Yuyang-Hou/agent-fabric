## MODIFIED Requirements

### Requirement: Enrollment creates isolated Device authority atomically
The server MUST atomically find or create the Human, create a new requester Device Principal, issue a Device Credential with only requester scopes, create a Grant fixed to the invitation policy, consume the invitation and Join Session, and write an allowlisted audit event. Reusing a Human that has Owner or other Device authority MUST NOT copy, merge or inherit those credentials, Scopes or Grants into the requester Device.

#### Scenario: First device for a new Human
- **WHEN** a previously unseen Google subject exchanges a valid code and verifier
- **THEN** one Human, one owned requester Device, one requester Credential, and one fixed-Revision Grant are committed together

#### Scenario: Additional device for an existing Human
- **WHEN** the same Google subject joins from another machine with a different invitation
- **THEN** the Human Principal is reused while the requester Device, Credential, and Grant are distinct and independently revocable

#### Scenario: Owner Human redeems an invitation
- **WHEN** a Human with an existing Owner Device redeems an invitation for another Agent
- **THEN** a distinct requester Device receives only invitation-derived authority and does not inherit Owner Scopes or ownership rights

#### Scenario: Concurrent replay
- **WHEN** two requests concurrently exchange the same code or invitation
- **THEN** exactly one transaction succeeds and the other fails without creating partial or duplicate authority
