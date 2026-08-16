## 1. Contracts and persistence

- [x] 1.1 Add self-service login, credential resource binding and redacted response contracts with validation tests.
- [x] 1.2 Extend PostgreSQL/MySQL migrations and persistence ports for Human-owned Device lookup, Agent ownership checks and Agent-bound Edge credentials.
- [x] 1.3 Add shared persistence tests for identity reuse, cross-owner denial, credential binding, replay and secret leakage.

## 2. Control Plane authentication and authorization

- [x] 2.1 Implement invitation-free Google OIDC login start/callback/exchange with loopback PKCE, allowlist/rate limits and atomic Owner Device creation.
- [x] 2.2 Enforce Human ownership on Revision, Grant, Invitation and device-credential issuance paths without granting `server:admin`.
- [x] 2.3 Add self-service MCP requester and Agent-bound Edge Device provisioning endpoints with independent revocation semantics.
- [x] 2.4 Reject Edge Agent/Revision binding mismatches before Deployment registration and add WebSocket contract tests.

## 3. CLI product flow

- [x] 3.1 Implement `agent-fabric login` using browser loopback PKCE and private atomic Owner configuration.
- [x] 3.2 Implement one user-facing publish orchestration over bounded ContextCapsule disclosure, Agent/Revision publication, own requester Grant, MCP setup and Agent-bound Edge provisioning.
- [x] 3.3 Make macOS Edge installation/start idempotent, verify online before success, and provide deterministic partial-failure recovery plus non-macOS manual continuation.
- [x] 3.4 Add CLI golden/integration tests proving first publish, retry, no-confirmation no-op and prohibited-secret redaction.

## 4. Distribution and product acceptance

- [x] 4.1 Update installable client distribution, Codex plugin Skill and user documentation for the two paths: publish mine and join/ask others.
- [x] 4.2 Run package tests, typecheck, source/package/release gates and strict OpenSpec validation, recording evidence in this change.
- [x] 4.3 Deploy through the project test branch and verify isolated Google login → publish → Edge online → invite → second-user join → Codex ask; pause only for Google browser consent if required.

### Verification evidence

- 2026-08-12: 个人 Railway Docker 首次部署验证发现 `/v1/client/agent-fabric-client.tgz` 返回 `client-package-unavailable`；已让构建产物同步到普通 Server 的实际查找目录，并增加发布包与服务包字节一致性校验。`pnpm run build`、`pnpm run verify:client-distribution`、source policy 与三个 strict OpenSpec 校验通过。
- 2026-08-12: 个人 Railway 真实验收发现既有 Codex MCP 注册仍指向公司测试构建，且公网安装包遗漏 Codex Skills；补充 stale MCP 精确替换、配置路径校验、两项 Skills 打包与用户级安装，避免线上客户端继续依赖源码仓库或公司凭据。
- 2026-08-12: `pnpm run test:unit` — 46 files / 165 tests passed.
- 2026-08-12: `pnpm run test:contract` — 10 files / 43 tests passed.
- 2026-08-12: lint, typecheck, source policy, package boundaries, managed runtime dependencies, installable client smoke (including Edge), supply-chain and development release gates passed.
- 2026-08-12: strict validation passed for this change, `trusted-agent-messenger-mvp`, and `agent-fabric-v1-foundation`.
- 2026-08-12: pipeline `5207719` deployed commit `10917c97` to testing as deployment `4232057`; image `yuanfd/agent-fabric:test_10917c_6886591` became ready.
- 2026-08-12: the public client package completed Google login, published `Atlas Google 自助发布验收`, brought its Edge online, created an invitation, joined from an isolated second-user home, and returned the expected Agent answer.
