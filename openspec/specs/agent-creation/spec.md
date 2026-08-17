# agent-creation Specification

## Purpose

定义空白、模板与 AI Builder 三种 Agent 创建流程。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

### Requirement: Creation offers blank, template and AI Builder methods
The New Agent action SHALL be available only to the signed-in owner of the personal Account and SHALL open a Multica-aligned method chooser with blank creation, approved templates and AI-assisted creation. AI Builder MUST be a local, ephemeral Desktop/Edge session with no AgentDraft identity, Cloud Builder orchestration, autosave, restore or version conflict behavior. Every method MUST produce the same locally validated final Agent create contract with private access by default.

#### Scenario: Owner chooses blank creation
- **WHEN** the personal Account owner selects blank Agent
- **THEN** the studio opens with unsaved local configuration state, safe private access defaults and only that owner's actually bindable Runtimes

#### Scenario: Friend lacks create authority
- **WHEN** a friend reaches another Human's create route or submits that Human's Account/Runtime identifiers
- **THEN** the operation is denied and no Builder session, Skill, Agent or cross-Account metadata is created

#### Scenario: Owner uses AI Builder locally
- **WHEN** the owner enters AI Builder, selects a healthy local Runtime and completes one or more generation turns
- **THEN** Desktop/Edge MUST call that Runtime directly, update only the in-memory conversation and preview, and MUST NOT send any `/v1/agent-drafts*` request or expose a draft ID or server version

#### Scenario: Cloud is unavailable during Builder generation
- **WHEN** the Account Server or Cloud is unavailable after the owner has a usable local session and the selected local Runtime remains available
- **THEN** entering additional Builder turns and modifying the preview MUST continue without a Cloud draft or Builder dependency

#### Scenario: Owner leaves AI Builder
- **WHEN** the owner navigates away, closes the Builder or restarts Desktop before final creation
- **THEN** the local Builder session is discarded and the product MUST NOT offer continue-draft or restore-draft behavior

#### Scenario: Final configuration fails local validation
- **WHEN** the owner clicks create while the local Agent configuration is incomplete or invalid
- **THEN** Desktop MUST show bounded local validation feedback and MUST NOT send an Agent create request

#### Scenario: Owner creates the generated Agent
- **WHEN** the owner clicks create with a complete locally validated configuration
- **THEN** Desktop MUST send exactly one final Agent create request containing the complete configuration, MUST NOT automatically retry it, and on success MUST clear the Builder session and open the new Agent detail

### Requirement: Local creation validates complete Agent configuration
Every creation method SHALL capture the complete Agent identity, description, Instructions, Runtime, model/runtime options, capabilities and access in local state. Desktop MUST validate the complete configuration before submit, while the Server remains authoritative for the single final create request.

#### Scenario: Valid local Agent configuration is created
- **WHEN** all required fields are locally valid and the selected Runtime remains bindable
- **THEN** Desktop sends one complete create request, the Server commits one Agent and its declared relationships atomically, and the user enters its detail page

#### Scenario: Runtime becomes unavailable
- **WHEN** the selected Runtime goes offline, is deleted or becomes private before submit
- **THEN** creation fails with a field-level recoverable error, the current-page local configuration remains visible and no partial Agent is created

#### Scenario: Builder output is malformed
- **WHEN** the local Runtime returns a reply without a valid bounded Agent configuration proposal
- **THEN** the current-page Builder shows a recoverable error, preserves the prior local configuration and creates no Agent

### Requirement: Template creation is transactional
Templates SHALL describe approved defaults and Skill references; selecting a template SHALL import/find referenced Skills and create the Agent in one transaction, without allowing clients to mint server-owned system identity.

#### Scenario: Template creation succeeds
- **WHEN** a valid template and Runtime are submitted
- **THEN** referenced Skills are deduplicated in the Account and one configured Agent is created

#### Scenario: Skill import fails
- **WHEN** any referenced Skill cannot be validated or imported
- **THEN** no partial Agent, Skill association or duplicate Skill remains
