# codex-acp compatibility spike

This spike validates the official `@agentclientprotocol/codex-acp` adapter as the first real implementation behind Agent Fabric's `RuntimeAdapter` boundary.

## Pinned inputs

- `@agentclientprotocol/codex-acp` `1.1.14`
- `@agentclientprotocol/sdk` `1.3.0`
- bundled `@openai/codex` `0.147.0` by default; an explicit `CODEX_PATH` remains a compatibility override
- ACP mode forced to `read-only`; client file writes and terminal capabilities are not advertised

## Verification

```bash
pnpm test
pnpm verify
```

The live verification checks runtime discovery, existing local authentication, read-only execution, streamed progress events, close/resume, cancellation propagation, unchanged fixture contents, zero permission/write requests, and adapter-boundary error normalization.

## Decision

Adopt `codex-acp` behind an Agent Fabric-owned `RuntimeAdapter`; do not expose ACP sessions directly to the cloud or copy the adapter's internal state model.

The adapter is Apache-2.0 and already translates Codex App Server events to ACP. Agent Fabric still owns local session correlation, permission defaults, event redaction, runtime health, and normalized failures. A future Runtime must pass the same adapter contract without requiring changes to the Account Agents product or standard A2A boundary.
