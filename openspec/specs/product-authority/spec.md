# product-authority Specification

## Purpose

定义仓库唯一产品目标、默认产品面与历史材料隔离规则。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

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

### Requirement: Superseded product material is absent from the active repository tree
The repository SHALL retain superseded product planning only under `openspec/changes/archive/` and SHALL retain a bounded audit index under `docs/history/README.md`. Dedicated historical source packages, app modules, deployment files, Skills, Spikes, ADRs, acceptance documents and architecture documents MUST NOT remain in active product or documentation roots after their current-compatible evidence has been absorbed by current tests.

#### Scenario: Developer searches the active tree
- **WHEN** a developer or coding Agent searches ordinary app, package, deployment, Skill, Spike or documentation roots
- **THEN** it finds only the current Account Agents product and reusable Runtime/A2A/Google/security primitives, not an implementable Personal Agent, Messenger/Matrix, Atlas/ContextCapsule, old Control Plane/PostgreSQL or legacy CLI product path

#### Scenario: Historical reasoning is needed
- **WHEN** a developer needs to audit a superseded decision
- **THEN** the bounded history index identifies the archived OpenSpec or Git history without making historical tasks or implementation files active authority

### Requirement: Multica remains a clean-room research source
The product SHALL use the fixed Multica research commit only to derive behavior and interaction requirements, and MUST reject Multica packages, source files, assets, branding, copy, CSS tokens, component names, class names and private API shapes from the product dependency and source graph.

#### Scenario: Source policy runs
- **WHEN** a product file imports `@multica/*` or contains a registered Multica source/asset marker
- **THEN** source-policy verification fails before release

#### Scenario: UI is independently implemented
- **WHEN** a Multica-aligned surface is delivered
- **THEN** its Agent Fabric tokens, components, copy and code are independently defined while its tested information hierarchy and interaction outcomes match the approved reference mapping
