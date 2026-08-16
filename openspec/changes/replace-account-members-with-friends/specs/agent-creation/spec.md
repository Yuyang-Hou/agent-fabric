## MODIFIED Requirements

### Requirement: Creation offers blank, template and AI Builder methods
The New Agent action SHALL be available only to the signed-in owner of the personal Account and SHALL open a Multica-aligned method chooser with blank creation, approved templates and AI-assisted creation; every method MUST produce the same validated Agent create contract with private access by default.

#### Scenario: Owner chooses blank creation
- **WHEN** the personal Account owner selects blank Agent
- **THEN** the studio opens with an unsaved draft, safe private access defaults and only that owner's actually bindable Runtimes

#### Scenario: Friend lacks create authority
- **WHEN** a friend reaches another Human's create route or submits that Human's Account/Runtime identifiers
- **THEN** the operation is denied and no draft, builder session, Skill, Agent or cross-Account metadata is created
