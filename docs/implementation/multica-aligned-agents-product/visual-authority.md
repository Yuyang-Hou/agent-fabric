# Multica-aligned Agents visual authority

> Approved by product on 2026-08-13 after the user supplied the Agents catalog screenshot and explicitly requested direct Multica visual fidelity.

## Approved references

- Primary catalog and shell reference: `/var/folders/bv/rw2xj8vn3tx_28dffjdd5dm00000gn/T/codex-clipboard-1c54112d-6ae5-4798-8c43-2c616493a975.png`
- Creation chooser: `/Users/hyy/project/multica/apps/docs/public/images/docs/quickstart-new-agent.png`
- Manual creation: `/Users/hyy/project/multica/apps/docs/public/images/docs/tutorial-create-agent-form.png`
- Agent detail: `/Users/hyy/project/multica/apps/docs/public/images/docs/tutorial-agent-detail.png`
- Runtime catalog/detail: `/Users/hyy/project/multica/apps/docs/public/images/docs/tutorial-runtimes-list.png` and `tutorial-runtime-detail.png`
- Members/invitation: `/Users/hyy/project/multica/apps/docs/public/images/docs/members-roster.png` and `tutorial-invite-member.png`
- Interaction evidence is fixed to Multica commit `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7`.

The external files are read-only research evidence. They are not copied into, imported by or shipped with Agent Fabric.

## Composition contract

| Surface | Approved composition | Deterministic state variants |
| --- | --- | --- |
| Login | Quiet full-height neutral field; one centered compact login panel; Agent Fabric identity, short Account purpose, one Google action, pending/error below the action. | signed out, signing in, expired, retryable failure |
| Shell | macOS title-bar clearance; compact left rail; one inset white canvas with a continuous header; exactly Agents, Runtimes and Members. | online, reconnecting, offline, session expired, narrow rail/header |
| Agents | Header and New Agent at top; search + mine/all/archived scopes; filter/sort/columns on the right; dense ruled rows with two-line identity and stable Status/Owner/Access/Runtime/Recent columns. | typical, loading, empty, no-match, error, archived, needs-runtime, offline, batch selection |
| Create | A separate method chooser; blank/template/AI are separate routes. Manual mode uses section headings and aligned setting rows with a sticky Create action. Builder uses local conversation on the left and live preview on the right. | chooser, manual, template, AI pending/error, local validation, discarded-on-exit |
| Agent detail | Breadcrumb + identity/status header; Overview/Activity/Capabilities/Settings intent tabs; overview content plus a bounded facts rail; settings use label/description/control rows. | editable, read-only, dirty, secret-redacted, unsupported, archived, unbound, offline |
| Runtimes | Same collection language as Agents; compact runtime row; detail identity header and structured settings; deletion uses a focused impact dialog. | ready, checking, auth-required, unavailable, offline, delete impact |
| Members | Same collection language; invitation form above dense member/pending rows; roles are quiet chips; removal uses a focused impact dialog. | members, pending invitation, forbidden, expired invite, removal impact |
| Narrow 768/414 | Sidebar collapses to a top destination strip; collection/detail becomes one pane; primary action, search and scopes stay visible; secondary columns move into row metadata/detail. | every primary surface; no document horizontal scroll |

## Comparison matrix

| Reference quality | Agent Fabric decision | Deliberate difference |
| --- | --- | --- |
| Quiet macOS shell and inset canvas | Preserve hierarchy, neutral surfaces and toolbar clearance | No Workspace switcher, browser-like tabs or unrelated global actions |
| Compact grouped navigation | Preserve row density, monochrome icons and restrained selected state | Exactly three destinations: Agents, Runtimes, Members |
| Dense collection rows | Preserve two-line identity, aligned operational columns and sparse status color | Agent Fabric uses Account access and only real Codex Runtime data |
| Separate creation modes | Preserve dedicated chooser and progressive disclosure | Add a Template route; keep Builder state local and send only one final create request |
| Stable detail identity header and intent tabs | Preserve scan order, content density and settings-row grammar | Activity replaces Multica work assignment; no DM/assign-work controls |
| Runtime and member administration share the system | Preserve collection/detail/impact-dialog primitives | Account replaces Workspace; credentials never enter Renderer fields |

## Component and medium inventory

All visible product UI is semantic React/HTML/CSS with `lucide-react` icons. No reference raster, generated raster, third-party logo or Multica asset is needed. Hairlines provide structure; floating account menus and dialogs use the single approved soft shadow. Corners stay restrained: controls 8px, inset canvas and protected panels 14–16px. Inter Variable carries interface text; JetBrains Mono is limited to machine values.

The primary action is a compact dark button, not a branded illustration. The dominant composition is the relationship between quiet shell, compact rail and inset canvas; feature surfaces must not replace it with cards, dashboards or decorative imagery.

## Acceptance mapping

The shipped fixture and real-state capture scripts must render the states above at 1280×800, 1440×900, 1728×1117, 768×900 and 414×896. Review compares hierarchy, density, action placement, focus order, responsive topology and truthful states. It does not compare or reuse exact Multica pixels, tokens, classes, copy or source.
