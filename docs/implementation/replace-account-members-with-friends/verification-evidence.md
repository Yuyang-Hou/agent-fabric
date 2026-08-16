# Human Friends product verification evidence

## Automated verification

| Scope | Command | Result |
| --- | --- | --- |
| Full repository gate | `pnpm run check` | passed |
| Unit | `pnpm run test:unit` | 55 files, 274 tests passed |
| Contract | `pnpm run test:contract` | 3 files, 18 tests passed |
| Desktop build | `pnpm --dir apps/desktop run build:app` | passed |
| Deterministic Desktop capture | `node scripts/capture-account-product-ui.mjs` | 37 screenshots generated; layout assertions passed |
| Type, lint and build | included in full repository gate | passed with zero lint warnings |
| Source/default product/boundaries/SBOM | included in full repository gate | passed; 565 supply-chain components |
| Development release gate | included in full repository gate | passed |

## Covered product behavior

- Friend invitation persistence covers unregistered recipients, normalized verified email, self-invite denial, reciprocal pending duplicate denial, expiry, mismatched recipient, replay and optimistic removal.
- A Friendship is symmetric across two personal Accounts. It never creates Account membership or role authority.
- Owner management remains personal-Account scoped. Friend authorization applies only to Agents explicitly configured as `friends`.
- Desktop shows incoming/outgoing invitation records and safe friend-opened Agent rows; friend rows expose no Account, Runtime, model/configuration, Instructions, Skill detail, Activity/workload, secret or management payload.
- MCP remains exactly `list_agents`, `find_agent`, `ask_agent`, `get_task`; friend discovery and A2A use the same current authorization as Desktop.
- Task reads, private toggles and Friendship removal recheck current authorization before returning cached results or executing a Runtime.
- Human-scoped WebSocket invalidation refreshes invitations, Friendships and the friend Agent catalog across personal Accounts; reconnect rebuilds from authoritative queries.
- Legacy member/join endpoints return bounded `410 account-membership-model-retired`; legacy shared access migrates fail-closed to private.
- Friends and friend-opened Agent candidate screenshots were manually reviewed at 1280, 768 and 414 widths; the capture harness reported no overflow or wrapped buttons. Product approval remains a real-environment gate below.

## Target-database migration audit

- On 2026-08-16, an explicitly authorized temporary Railway Function ran the six-count audit against `agent-fabric-alpha` production MySQL inside `START TRANSACTION READ ONLY` and completed with `ROLLBACK`.
- Deployment `e4653623-7d56-4b71-aaa0-8f304acad0d7` reported: `nonOwnerMemberships=0`, `nonOwnerAgents=0`, `nonOwnerRuntimes=0`, `nonOwnerSessions=0`, `pendingMemberInvitations=2`, and `legacySharedAgents=0`.
- Because every non-owner Human/resource/session count is zero, the bounded per-Human resource migration plan is not required. Schema v11 will revoke the two pending legacy member invitations and will not convert them into Friendships.
- The temporary audit service was deleted after result readback; the production environment was independently confirmed to contain only the original `api` and `MySQL` services, both healthy. Database URLs, credentials, invitation identities and row details were neither queried nor recorded.

## Signed beta self-test candidate

- `v0.1.0-beta.3` was built from current public `main`, signed with Developer ID, accepted by Apple notarization, stapled and accepted by Gatekeeper on macOS arm64.
- The quarantined DMG and copied App completed first launch into the Account Agents product without a white screen. The installed `/Applications/Agent Fabric.app` reports `0.1.0-beta.3`, has a valid deep signature and App Staple, and is accepted by Gatekeeper.
- The GitHub Pre-release is public at <https://github.com/Yuyang-Hou/agent-fabric/releases/tag/v0.1.0-beta.3>. Its DMG, DMG blockmap, ZIP, ZIP blockmap and `beta-mac.yml` were read back as uploaded with exact local sizes after post-Staple metadata refresh.
- The packaged product check found the four MCP tools `list_agents`, `find_agent`, `ask_agent`, `get_task`; the running installed App showed the Friends navigation, owned/friend-opened Agent scopes and healthy Runtime/MCP/Cloud status.
- This candidate enables manual Friendship acceptance only. It does not approve the final commercial or trusted updater gates.

## Real-environment gates intentionally not claimed

- Two-distinct-Google-Human acceptance, real cross-user A2A, immediate revoke verification and product screenshot approval require the user's real accounts/environment.
- Real updater N-to-N+1 requires a later signed beta and was not performed. The commercial release gate remains fail-closed until the remaining real acceptance and updater actions pass.
