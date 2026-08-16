## ADDED Requirements

### Requirement: Superseded plans are historical rather than active work
The repository SHALL expose `multica-aligned-agents-product` as the sole product authority. Supporting cleanup changes MAY be active only while they converge that target, and superseded product changes MUST be archived without syncing their abandoned deltas or completing unimplemented tasks.

#### Scenario: Developer lists OpenSpec changes
- **WHEN** the convergence change has been completed and archived
- **THEN** Personal Agent, Messenger/Matrix, headless publication and foundation changes do not appear as active implementation work

#### Scenario: Historical evidence is needed
- **WHEN** a current authorization, A2A, Runtime or leakage test needs prior evidence
- **THEN** the archived artifact remains readable but its product requirements and incomplete tasks confer no current authority

### Requirement: Current artifacts expose only the Account Agents product
The signed Desktop, downloadable client, Server and Edge artifacts SHALL expose Account login, Agents, Runtimes, Members, Account-scoped Runtime execution, the four-tool MCP and isolated Account self-test. They MUST NOT contain executable Atlas/ContextCapsule publication, Personal Agent/Friends, Messenger/Matrix, AgentSpec, Revision or Deployment product commands.

#### Scenario: Desktop artifact is inspected
- **WHEN** the packaged App resources and executable entry points are enumerated
- **THEN** they contain the Account product Renderer, Account Runtime worker, Codex Adapter and Account MCP, and contain no Atlas CLI or legacy Personal/Messenger executable

#### Scenario: Client command surface is inspected
- **WHEN** the downloadable client help and bundled command dispatch are inspected
- **THEN** only Account setup/login/logout/doctor, Agent discovery/question/task read and isolated self-test operations are reachable

#### Scenario: Removed command is invoked
- **WHEN** a caller invokes legacy join, publish, invite, context publication or Personal Agent management syntax
- **THEN** the client returns a stable unsupported-command failure and performs no credential, network, filesystem or Runtime mutation

### Requirement: Default build and release gates follow the current dependency graph
The default build, typecheck, lint, test, SBOM and release gates SHALL include all code reachable from current product entry points and MUST reject forbidden historical product packages, commands or executables. Current Account Agents releases MUST NOT be blocked by a Matrix-specific license decision when Matrix is absent from the current artifact.

#### Scenario: Forbidden code is outside a declared feature root
- **WHEN** a Desktop, Edge, Server or client build entry point imports or bundles a forbidden historical product module
- **THEN** default-product or packaged-product verification fails even if the module is outside the configured feature source roots

#### Scenario: Current commercial release is checked
- **WHEN** an Account Agents release contains no Matrix dependency or executable
- **THEN** its commercial gate evaluates current source, dependency, signing, notarization and artifact requirements without requiring a Matrix Homeserver decision

### Requirement: Reusable primitives do not retain superseded product semantics
Google login, credential storage, app lifecycle, standard A2A, Runtime Adapter and security primitives MAY be retained, but current modules and public exports SHALL use Account- or Runtime-neutral names and MUST NOT require Personal Agent, Friend, Room, ContextCapsule, Revision or Deployment state.

#### Scenario: Current Desktop starts
- **WHEN** the Account product initializes login, credential storage and lifecycle management
- **THEN** those primitives operate without importing a superseded product domain package or exposing a legacy IPC/API contract

#### Scenario: Historical data exists
- **WHEN** deployed MySQL contains old compatibility tables or rows
- **THEN** the current product ignores them safely and does not register the removed APIs, without destructively dropping data in this change

### Requirement: Current authority documents are internally consistent
`AGENTS.md`, README, `ARCHITECTURE.md`, current OpenSpec and product documentation SHALL describe the same Account Agents boundary, four MCP tools and Edge privacy model. Normative current instructions MUST NOT require legacy change validation, Matrix/Messenger gates, or AgentSpec/Revision/Deployment implementation.

#### Scenario: A developer follows repository instructions
- **WHEN** the developer reads the normal current documentation and runs its prescribed gates
- **THEN** every instruction advances or verifies the Multica-aligned Account Agents product and none reactivates a superseded product plan

#### Scenario: Future research is retained
- **WHEN** AgentSpec, Revision, Deployment, Matrix or Colleague Mesh research remains in the repository
- **THEN** it is explicitly historical or future-only, outside current authority and absent from current implementation tasks
