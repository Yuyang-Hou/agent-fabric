# Historical product audit index

This is the only active-tree index for superseded Agent Fabric product directions.

- Current authority: `openspec/CURRENT.md` and `openspec/changes/multica-aligned-agents-product/`.
- Archived specifications: `openspec/changes/archive/` retains superseded OpenSpec artifacts as read-only audit evidence.
- Removed implementation families: Messenger/Matrix, Personal Agent/Friends, Atlas/ContextCapsule publication, AgentSpec/Revision/Deployment, Colleague Mesh, the old Control Plane, Postgres persistence and their dedicated Desktop/Edge/Server paths.
- Removed design and acceptance families: the old Messenger, Matrix, Personal Agent, Atlas, headless deployment and spike-gate documents.

The removed files are intentionally absent from the active repository. Recover a historical file only for audit with Git, for example:

```bash
git log --all -- path/to/removed-file
git show <commit>:path/to/removed-file
```

Historical material MUST NOT be restored, imported by current executables, required by current release gates or turned into implementation work without a new user-approved OpenSpec change.
