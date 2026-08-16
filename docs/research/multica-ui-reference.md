# Multica UI Reference — Clean-room Mapping

> Status: user-approved visual and interaction reference for the Account-scoped Agents product

## Evidence

- Official repository cloned to `/Users/hyy/project/multica` at commit `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7`.
- The user-provided Agents catalog screenshot is the primary approved shell/catalog composition.
- Fixed-commit documentation screenshots cover creation chooser, manual creation, Agent detail, Runtime list/detail and Members/invitation.
- Relevant research surfaces include `packages/views/auth/login-page.tsx`, `apps/desktop/src/renderer/src/components/desktop-layout.tsx`, `packages/views/layout/app-sidebar.tsx`, `packages/views/inbox/components/inbox-page.tsx`, `packages/views/settings/components/settings-layout.tsx` and `packages/ui/styles/tokens.css`.

These paths are evidence locations, not implementation inputs.

## Extracted principles

1. The macOS frame, a quiet outer shell and an inset white page canvas establish application hierarchy before cards do.
2. Navigation is compact, grouped and mostly monochrome; the current row uses a restrained neutral selection surface.
3. Pages prefer headers, ruled rows, tables and list-detail panes over dashboard card grids.
4. Status color is sparse and semantic. Most hierarchy comes from type, whitespace and one-pixel dividers.
5. Forms use aligned setting rows with the label and explanation on the left and a bounded control on the right.
6. Signed-out authentication is one centered task card with large surrounding whitespace.
7. Compact layouts switch between list and detail instead of shrinking both into unusable columns.

## Agent Fabric mapping

| Surface | Agent Fabric composition |
| --- | --- |
| Login | Centered Agent Fabric card with short privacy-oriented copy, one Google button, real busy/error state and no email/OTP field because Google is the only implemented identity path. |
| App Shell | macOS toolbar clearance, compact fixed left rail, exactly three destinations, quiet account/Host footer and inset main canvas. No workspace switcher, global search or task creation. |
| Agents | Collection header, search/scopes/filter/sort/columns and dense two-line rows with truthful status, owner, Account access, Runtime and activity. |
| New Agent | Separate blank, template and AI Builder choices; manual and Builder surfaces preserve context and visible primary action. |
| Agent detail | Stable identity/status header with Overview, Activity, Capabilities and Settings; settings use aligned rows and dirty guards. |
| Runtimes | Compact resource catalog and identity-led detail, with health/auth guidance and deletion impact disclosure. |
| Members | Invitation form and dense member/pending rows, with role and removal impact flows in the shared system. |
| Account popover | Small structured menu for account identity and logout only. No workspace creation or unrelated settings destinations. |

## Independent implementation boundary

- Do not paste, translate, modify or import Multica source, classes, CSS variables, tokens, assets, copy or package code.
- Do not reproduce exact pixel dimensions or recognizable Multica brand geometry.
- Define Agent Fabric semantic tokens and component APIs from product needs, then review the result against the principles above rather than source-line similarity.
- Keep Multica outside the Agent Fabric product tree and production dependency graph; source-policy remains fail closed.

## Superseded directions

The earlier Personal Agent/Friends/Activity, railway interlocking, patchbay, boarding-pass and generic console compositions are rejected. They are not design authority and must not influence implementation. The approved state/composition matrix is recorded in `docs/implementation/multica-aligned-agents-product/visual-authority.md`.
