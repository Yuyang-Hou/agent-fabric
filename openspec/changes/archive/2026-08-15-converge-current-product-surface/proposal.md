## Why

The Multica-aligned Account Agents product is now the sole product target, but superseded OpenSpec plans, documentation, workspace dependencies, compatibility commands and packaged executables still expose Personal Agent, Messenger/Matrix, Atlas publication and Revision/Deployment concepts. This competing surface can misdirect development, enlarge the shipped attack and support boundary, and prevent the remaining real acceptance from proving the product the user actually requested.

## What Changes

- **BREAKING**: archive superseded product changes as historical evidence without syncing their deltas into current specs, so they no longer appear as active implementation work.
- **BREAKING**: remove Atlas/context publication, Personal Agent/Friends management, Messenger/Matrix and Revision/Deployment compatibility commands from the default Desktop, CLI, Edge worker, Server and client distribution surfaces.
- Make the build, typecheck, test, package-boundary and release-gate graph describe only the current Account Agents product plus reusable runtime-neutral A2A/Runtime/security primitives.
- Split current architecture and development rules from future or historical research; current authority MUST NOT require legacy OpenSpec validation or the Matrix commercial license gate.
- Rename retained login, credential-vault and lifecycle primitives away from the superseded Personal Agent product model.
- Strengthen default-product verification to inspect executable entry points, workspace dependency edges and packaged artifacts rather than only declared source roots.
- Preserve historical evidence and reusable security tests outside the default product graph; do not rewrite published history or weaken Edge privacy, A2A conformance, authorization, revocation or leakage protections.

Explicit non-goals: adding a new user-facing capability, changing the four MCP tools, changing standard A2A wire semantics, removing reusable Google/OAuth/credential-vault/Runtime Adapter code, changing Account authorization, or claiming the remaining real multi-user acceptance without executing it.

## Capabilities

### New Capabilities

- `current-product-convergence`: defines the sole active planning surface, allowed default build and release graph, exclusion of superseded product capabilities from shipped artifacts, and preservation of reusable historical evidence.

### Modified Capabilities

- `isolated-self-test`: requires the real-path self-test and its distributable client to operate without Revision/Deployment, ContextCapsule, Friend or legacy publication compatibility commands.

## Impact

- OpenSpec: superseded changes move to read-only archive; current authority and validation commands are simplified.
- Product UI/Desktop: no visual feature expansion; packaged bin and Edge resources lose Atlas/Personal/Messenger compatibility surfaces.
- CLI/client distribution: retains Account login/doctor/list/ask/get/self-test and four-tool MCP; removes hidden migration commands and ContextCapsule/Revision state.
- Cloud/Control Plane: legacy Personal Agent routes, tunnel registrations and Matrix-related commercial gates are removed from the current server graph.
- Edge Host/Runtime Adapter: retains account-scoped Runtime execution and privacy boundaries; removes context publication and legacy personal controllers from the shipped worker.
- Build/release: workspace references, dependencies, gates, SBOM and packaged-product verification become current-product-only.
- A2A: no protocol change; all Agent invocation remains standard A2A v1.0.1.
