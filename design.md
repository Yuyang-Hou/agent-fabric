# Agent Fabric product design contract

> Product authority: `replace-account-members-with-friends`
> Mode: Operate
> Status: shipped implementation contract; visual authority and evidence are under `docs/implementation/multica-aligned-agents-product/`

## Product shape

Agent Fabric is a personal multi-Agent and Human-friend operating surface. The signed-in shell has exactly three primary destinations: Agents, Runtimes and Friends. Each Human owns one personal Account; friendship never changes Account ownership or grants management authority. Login is the only signed-out product state. There is no Account switcher, Workspace, project, task board, inbox, generic chat, automation or analytics destination.

The visual comparison target is Multica's interaction completeness and information hierarchy at the fixed research commit, not its source or pixels. The user-approved catalog screenshot and documented Multica surfaces are the composition authority. Agent Fabric owns all routes, component contracts, tokens, copy, icons and dimensions.

## Composition rules

- A quiet macOS outer frame holds one compact navigation rail and one inset content canvas.
- Collection pages use one semantic header, one toolbar and dense ruled rows. Avoid dashboard card grids.
- Agent detail uses a stable identity/status header and four intent sections: Overview, Activity, Capabilities and Settings.
- Settings use aligned label/description/control rows with explicit save, dirty, error and read-only states.
- Narrow widths show either collection or detail and provide an explicit back action; they never crush both panes together.
- Status color is sparse and always paired with text or an icon. Hierarchy comes primarily from typography, spacing and hairlines.
- Login is one focused task with real pending, failure and recovery behavior.

## Agent Fabric-owned tokens

`apps/desktop/src/tokens.css` is the shipped source of truth. The implementation uses semantic roles rather than borrowed dimensions:

- surfaces: `--fabric-shell`, `--fabric-canvas`, `--fabric-raised`, `--fabric-selected`
- text: `--fabric-text`, `--fabric-text-muted`, `--fabric-text-faint`
- rules: `--fabric-rule`, `--fabric-rule-strong`, `--fabric-focus`
- states: `--fabric-positive`, `--fabric-warning`, `--fabric-negative`, `--fabric-info`
- spacing: `--fabric-space-1` through `--fabric-space-8`, based on an independent 4 px rhythm
- shape: `--fabric-radius-control`, `--fabric-radius-panel`, `--fabric-shadow-float`

Raw colors, inline brand geometry and copied third-party token prefixes are forbidden in feature components. The shipped token values and deterministic screenshots are the final visual baseline.

## Independent component contract

- `ProductFrame`: macOS clearance, navigation and current Account identity.
- `PrimaryNav`: exactly Agents, Runtimes and Friends with accessible current-state semantics.
- `ResourceHeader`: title, count/description and one primary action.
- `ResourceToolbar`: search, scope, filter, sort and column controls with visible active state.
- `ResourceRoster`: loading/empty/error/no-match rows, stable keyboard navigation and selectable records.
- `IdentitySummary`: avatar, name, status, owner/access/runtime summary and permission-aware actions.
- `IntentTabs`: top-level detail intent and conditional secondary settings navigation.
- `SettingsGroup` / `SettingsField`: aligned explanatory forms with dirty/save/error/read-only contracts.
- `ImpactDialog`: fetched impact summary plus concurrency token before destructive confirmation.
- `StateNotice`: offline, archived, unbound, permission and unsupported-feature messages.

These names and APIs are Agent Fabric-specific. Product code must not reuse Multica component/class names, private paths or CSS tokens.

## Interaction and state contract

- Every asynchronous surface defines initial loading, refreshing, empty, recoverable error and stale-result behavior.
- Mutations define pending, success, failure and concurrency-conflict behavior. Destructive changes require an impact summary when they affect owned resources or active work.
- Search/filter/sort/scope state is URL- or Account-scoped and does not change full-set counts.
- Permission-denied and not-found responses are generic across Account and Friendship boundaries.
- Secrets are write-only by default; masked presence never reveals a value.
- Unsupported Runtime/provider capabilities are omitted or explicitly unavailable, never rendered as working controls.
- Focus is visible, keyboard order matches visual order, minimum targets are 44 px, motion respects reduced-motion, and narrow layouts do not horizontally scroll core actions.

## Copy and icon voice

Use direct Chinese product language: 创建 Agent、归档、恢复、绑定 Runtime、邀请好友、接受邀请、删除好友. Errors say what failed and what can be done next. Avoid startup slogans, fabricated metrics, exclamation marks, emoji and text-glyph icons. Use the repository's approved icon library consistently.

## Clean-room review gate

The approved deterministic composition/state matrix lives in `docs/implementation/multica-aligned-agents-product/visual-authority.md`. Renderer review compares hierarchy, density, action placement, interaction steps and state coverage against it. Approval does not authorize source, asset, copy, token, class or pixel reuse.

## Shipped route and state map

- Signed out: one Google login task with pending and recoverable failure.
- Agents: real catalog queries for mine/friends/archived, search, filters, sorts, columns, owner-only batch lifecycle and explicit empty/no-match/error/access-lost states. Friend rows use a separate read-only safe projection.
- Create: independent blank, template and AI Builder starts; server drafts, autosave, validation recovery and idempotent creation converge on one Agent shape.
- Agent detail: Overview, Activity, Capabilities and Settings; public edits use optimistic versioning and server-side safe merge, while private values use an explicit full-replacement write-only flow.
- Runtimes: search/status filter, truthful health/capability detail, edit, refresh, authentication guidance and deletion impact.
- Friends: active friends, received invitations and sent invitations; invite by email, accept/reject/revoke/remove, no roles, invitation tokens, Account joining, resource transfer or App chat.
- Narrow windows: primary navigation remains available; collection and detail are one pane at a time with explicit back actions and no document-level horizontal overflow.

The exact final evidence, commands and screenshot paths are recorded in `docs/implementation/multica-aligned-agents-product/shipped-ui-evidence.md`.
