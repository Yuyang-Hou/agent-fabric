## 1. Contract Foundation

- [ ] 1.1 Pin A2A v1.0.1 schemas and record the official type-generation or validation strategy
- [ ] 1.2 Define AgentSpec v1 JSON Schema, examples, validation errors, and sanitized Agent Card projection
- [ ] 1.3 Define Runtime Adapter v1 TypeScript interfaces, RuntimeEvent union, and adapter capability model
- [ ] 1.4 Resolve foundation ADRs for A2A type source, initial Repository, Edge tunnel transport, and Agent URL strategy

## 2. Domain Core

- [ ] 2.1 Create domain modules for Principal, Agent, Revision, Deployment, Grant, Context, Task, Artifact, and Trace
- [ ] 2.2 Implement immutable revision lifecycle, active deployment switching, and rollback rules
- [ ] 2.3 Implement policy types for filesystem, network, tools, side effects, budgets, concurrency, and delegation depth
- [ ] 2.4 Add domain tests for identity stability, revision immutability, Context isolation, and forbidden state transitions

## 3. A2A Service and Client

- [ ] 3.1 Implement sanitized Agent Card serving and supported-interface resolution
- [ ] 3.2 Implement A2A Send Message plus standard Task and Artifact mapping
- [ ] 3.3 Implement Get Task, List Tasks, and Cancel Task with authorization filtering
- [ ] 3.4 Add conformance fixtures for content type, TaskState, terminal-task behavior, multi-turn contextId, and unsupported operations

## 4. Control Plane

- [ ] 4.1 Implement Principal, Registry, Grant, Deployment, and Presence repositories behind explicit interfaces
- [ ] 4.2 Implement revocable scoped Grant enforcement for discovery and every A2A operation
- [ ] 4.3 Implement authenticated outbound Edge connection and stable Agent-to-Deployment routing
- [ ] 4.4 Add tests for revocation, impersonation, offline behavior, reconnect, and minimal cloud data

## 5. Edge Host and Fake Runtime

- [ ] 5.1 Implement Runtime Adapter host and deterministic Fake Runtime Adapter
- [ ] 5.2 Implement Session Manager mapping A2A contextId to private Runtime sessions with TTL and successor behavior
- [ ] 5.3 Implement Edge Policy Engine and cancellation propagation
- [ ] 5.4 Complete Client → A2A → Router → Edge → Fake Runtime multi-turn integration test
- [ ] 5.5 Add leakage tests proving credentials, cwd, Runtime handles, private instructions, and hidden reasoning never leave Edge

## 6. Foundation Acceptance

- [ ] 6.1 Run unit, contract, integration, disconnect, cancellation, isolation, and policy suites
- [ ] 6.2 Validate all OpenSpec artifacts strictly and reconcile completed task evidence
- [ ] 6.3 Review Architecture v1 assumptions against the running vertical slice and record follow-up ADRs
- [ ] 6.4 Prepare the next OpenSpec change for the real Codex Runtime Adapter without importing the Demo API
