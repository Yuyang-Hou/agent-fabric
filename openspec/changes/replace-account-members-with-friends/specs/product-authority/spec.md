## MODIFIED Requirements

### Requirement: This change is the sole active product authority
The repository SHALL treat `replace-account-members-with-friends` as the sole active product and implementation target. `multica-aligned-agents-product` and earlier OpenSpec changes MAY remain as read-only migration and reusable technical evidence, but their incomplete or conflicting requirements and tasks MUST NOT drive implementation, release or acceptance.

#### Scenario: Developer resolves conflicting plans
- **WHEN** an earlier change requires shared Account members/roles, single-Personal-Agent pair Friendship, friend-specific MCP tools or another surface excluded here
- **THEN** planning, implementation, tests, default configuration and acceptance SHALL follow this change and SHALL NOT implement the conflicting historical requirement

#### Scenario: Existing evidence remains useful
- **WHEN** an earlier test proves reusable Google, A2A, Runtime, revocation, Presence or leakage behavior compatible with this change
- **THEN** the implementation MAY retain that code and evidence without retaining its superseded membership or Agent-pair product model

### Requirement: Default product exposes only the new information architecture
The packaged Desktop, CLI help, documentation and default configuration SHALL direct users to login, Agents, Runtimes, Friends and local MCP access. They MUST NOT present Account Members/roles/resource transfer or the prior single Personal Agent/Friends/Activity experience as the current product.

#### Scenario: Packaged app launches
- **WHEN** a signed-in user opens the current packaged Desktop
- **THEN** the primary navigation shows Agents, Runtimes and Friends, Agents distinguishes owned and friend-opened rows, and no Members navigation or role control is present
