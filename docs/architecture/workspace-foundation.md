# Product Workspace Foundation

The product workspace requires Node.js 20.9 or newer and pnpm 9.15.9. Root commands are the only supported quality entry points:

```bash
pnpm install
pnpm run build
pnpm run check
```

`pnpm run check` runs lint, full TypeScript type checking, unit tests, contract tests, source provenance, package boundaries, and the development release gate.

## Module boundaries

| Module | Owns | Does not own |
| --- | --- | --- |
| `apps/desktop` | Account Agents UI, Electron security policy and typed Renderer IPC | Runtime execution, cloud authorization |
| `apps/server` | Login, Account/Agent/Runtime/Member APIs, access checks and A2A routing | Local Runtime execution or credentials |
| `apps/edge-host` | Local Runtime lifecycle, private configuration application and outbound tunnel | Product UI, cloud identity |
| `packages/account-agent-domain` | Account-scoped Agent, Runtime, member and creation contracts | Electron, HTTP or process execution |
| `packages/a2a-task` | Official A2A types/codecs and private-field exclusion | Product control-plane fields |
| `packages/runtime-contract` | Runtime-neutral contract | ACP or concrete Runtime details |
| `packages/persistence-mysql` | Current Account product persistence and migrations | UI or Runtime execution |
| `packages/mcp-server` | Thin discovery and A2A invocation tools | Private Runtime implementation |
| `adapters/runtime-fake` | Deterministic Runtime contract implementation | Product state |
| `adapters/runtime-codex-acp` | Codex ACP Runtime implementation | Cloud state or product authorization |

Product roots are checked for superseded product paths, frozen Demo markers and direct Multica source markers. The workspace contains only the current Account Agents graph and reusable Runtime/A2A/security primitives.

## Fixed protocol and security baselines

- `@a2a-js/sdk@1.0.1` is the only A2A type/codec source. Its generated wire version is `1.0`; Agent Fabric private routing, identity, revision, idempotency and Runtime fields are rejected inside canonical payloads.
- Desktop IPC uses Zod strict schemas and an explicit channel allowlist. Mutations carry explicit resource IDs and are authorized again by the Server.
- Renderer preferences are created with context isolation, sandbox and web security enabled, and Node integration plus webviews disabled.
- Runtime credentials, cwd and environment values remain Edge-private and may never be projected into Cloud product state.
