# OpenAI Store readiness — 2026-09-30

Status: **NOT READY. Security review found release blockers; local adapter fixes are only partial remediation. Not submitted or approved.**

This report records reproducible evidence for AtlasRepo MCP and the Codex plugin bundle. It does not authorize a deployment, Store submission, or publication.

## Evidence boundaries

- The supplied task history says AtlasRepo plugin v1.0.0 was rejected on September 6 because MCP test cases returned incorrect results, and identity case `13666371` was resolved on August 27. The exact email, year and prompts have not been independently verified.
- The exact rejection email and exact failing prompts are not present in this repository. Do not describe the five cases below as the original reviewer cases.
- Repository evidence did show a legacy review case for `octocat/Hello-World` whose expected result allowed either success or not-found. That ambiguous case has been replaced with deterministic known and explicitly missing fixtures.

## Current official requirements consulted

- [App review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Submission workflow](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy)

The following requirements are review targets, NOT a list of passing gates:

- public HTTPS Streamable HTTP endpoint;
- accurate tool names, descriptions, JSON input/output schemas, and annotations;
- representative success, missing/empty, invalid-input, authorization, rate-limit, and upstream-error paths;
- five positive and three negative review cases with exact expected tool behavior;
- OAuth scope enforcement, expired/malformed token rejection, and owner isolation;
- minimal grounded output with stable machine-readable errors;
- website, support, privacy, terms, square icon, and release notes in the plugin manifest.

## Defects fixed in this readiness pass

1. The plugin bundle launched a local STDIO npm process. It now points to the public Streamable HTTP endpoint `https://mcp.atlasrepo.com/mcp`.
2. Tool output schemas were declarations that did not validate runtime output. Every successful result is now parsed against its declared Zod schema.
3. Oversized results could keep full `structuredContent` while only text was truncated. Oversized results now fail closed with `result_too_large` and no structured payload.
4. Invalid upstream shapes could be returned as if valid. They now produce `invalid_upstream_shape` with status 502.
5. The HTTP app ignored its injected environment when constructing the API client. Tests now prove that the configured upstream is used.
6. Upstream errors exposed raw network messages and HTTP status text. The client now derives fixed codes from status, never reads error bodies, and accepts only bounded integer Retry-After seconds. Redirects are disabled. JSON response streams are limited to 128 KiB before parsing and share the request timeout.
7. `openWorldHint` was false although tools read a public, continuously changing catalog. It is now true; `readOnlyHint` remains true and `destructiveHint` remains false.
8. Review cases were vague and allowed multiple incompatible outcomes. They now specify exact calls, limits, filters, identities, and missing-record behavior.
9. Public setup docs diverged across Codex MCP, Claude, STDIO, and API-key fallback paths. User-facing docs now use the single confirmed plugin command:

   ```bash
   codex plugin marketplace add Arnon-hs/atlasrepo-mcp && codex plugin add atlasrepo@atlasrepo
   ```

10. Nested record schemas admitted arbitrary metadata and invalid tiers. Explicit DTO allowlists now strip unknown fields at every level, require identity fields, enumerate access tiers, preserve typed source URLs/quotes, and reject recognized credential-bearing text and URLs. This is defense in depth, not proof that arbitrary upstream prose contains no PII.
11. Recommendation input advertised limit 20 while the API supports 10; it now advertises 10. Repository dot segments fail before upstream I/O.

The command syntax was checked using installed Codex 0.142.4 help and repository marketplace/plugin names. An actual install and authenticated connection were not performed.

## Reproducible local suite

From the repository root:

```bash
npm ci
npm run readiness:store
npm audit --omit=dev
```

`npm run readiness:store` runs TypeScript checking, all deterministic tests, production build, protocol smoke, and packed-package smoke. The HTTP tests need permission to bind an ephemeral loopback port.

Local result on 2026-09-30:

- TypeScript check: passed.
- MCP follow-up tests: 29 passed, 0 failed (including 9 new boundary/stream/input tests).
- Build, protocol smoke, and packed-package smoke: passed.
- `npm audit --omit=dev`: 0 vulnerabilities after compatible transitive lockfile updates.
- Prior Platform baseline: 808 passed, 62 environment-gated tests skipped. Follow-up: 22 focused tests and TypeScript passed. No database-backed owner/quota E2E has been run for these changes.
- Prior Web baseline: 549 tests passed. Follow-up: 48 focused panel/App tests, changed-file lint and production build passed.
- Prior Playwright desktop and 390×844 checks used mocked API data. They prove rendering only, not actual quota or OAuth integration; repeat after integration.

The deterministic Store scenarios are in `tests/store-readiness.test.ts`. They run entirely against an in-memory MCP transport and a closed fixture API:

| Scenario | Expected call/result |
| --- | --- |
| Semantic search | `atlasrepo_recommend`, `limit: 8`, exact semantic fixture |
| Vertical video | `atlasrepo_recommend`, `limit: 5`, exact video fixture |
| Video quality | `atlasrepo_search_tools`, `q: video`, `minQuality: 0.7` |
| Known repository | `atlasrepo_get_repository`, `MCPJam/inspector`, canonical URL and evidence |
| Missing repository | exact `atlasrepo-review-fixture/not-present-20260930`, stable not-found error |

The three negative discovery cases are manifest metadata, NOT executed model-selection tests. Adapter tests cover malformed input, invalid output shapes, bounded streams and safe errors. The fixture now respects limits/filters and has an empty-result scenario, but it does not execute real ranking, OAuth, database quota or ChatGPT/mobile behavior.

## Account quota and connection checks

Platform and Web changes are kept in their owning repositories:

- `GET /api/account/mcp-oauth` returns an additive `quota` object with `tier`, `plan`, `unit`, `limit`, `used`, `remaining`, `windowSeconds`, `resetAt`, and `unlimited`.
- Existing quota accounting is a process-local Map and is NOT authoritative across replicas or the separate public MCP adapter. The follow-up labels it `authoritative: false, source: process_local`; UI hides these diagnostic numbers. In particular, unlimited usage zero was not evidence of zero usage.
- REST quota keys now prefer owner ID over OAuth client/application ID, matching Platform MCP. This fixes key selection only, not durable accounting or public adapter identity.
- Connection rows remain filtered by `user_id`. Presentation distinguishes active, refresh_required, expired, revoked and unknown without changing token validity or grants. SQL window counts cover all owner rows although only 50 rows are listed.
- The UI no longer calls a failed/loading fetch zero/not-connected, exposes quota units/windows when available, does not invent a meaning for null reset, and refreshes at expiry and every 30 seconds. Refreshable connections remain revocable.

## Release blockers requiring further work

1. Public MCP HTTP adapter still ignores caller bearer and uses its environment client. It must validate/forward the caller identity without a shared environment-key fallback. Invalid supplied tokens must never downgrade to anonymous.
2. OAuth `mcp:read` scope validation/enforcement and HTTP 401/403 handling are incomplete. The exact security-contract plan must be agreed with the parent before editing. Resource/audience discovery across the separate MCP origin also needs confirmation.
3. Account quotas need atomic shared database accounting and real multi-owner/multi-instance tests, not Map snapshots. No migration, Redis service or runtime config was created in this pass.
4. Production recommendation storage substitutes unrelated popular stories for no-match. The owning AtlasAI worker must fix `src/storage/stories.ts`; this task has not edited that file. Adapter fixtures cannot prove the production fix.
5. Platform legacy MCP tool schemas/output projection and session expiry/error paths need end-to-end verification. The standalone adapter fixes do not automatically fix the legacy five-tool server.

## Required checks before submission

These items require a coordinated staging/production release and therefore remain intentionally incomplete:

1. Deploy the reviewed commits together and confirm the deployed SHA for Web, Platform, and MCP.
2. Run MCP Inspector against the deployed public endpoint and save redacted evidence for all positive/error cases.
3. Connect the deployed plugin in each supported ChatGPT/Codex surface and verify stable desktop and mobile outputs.
4. Confirm OAuth consent, insufficient scope, expired access token, refresh-token expiry/revocation, owner isolation, and rate-limit reset behavior with dedicated non-production accounts.
5. Record and host the required reviewer walkthrough video; no review-video URL is present yet.
6. Reconcile the exact previous rejection email/test prompts if supplied, then add regression fixtures without guessing.
7. Re-run the live domain-verification and manifest rescan required by the submission UI.
8. Obtain explicit authorization before submitting or publishing. Passing this local suite does not imply OpenAI approval.
