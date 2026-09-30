# OpenAI Store readiness — 2026-09-30

Status: **locally ready for a coordinated staging review, not submitted and not approved**.

This report records reproducible evidence for AtlasRepo MCP and the Codex plugin bundle. It does not authorize a deployment, Store submission, or publication.

## Evidence boundaries

- The task history says AtlasRepo plugin v1.0.0 was rejected on 2026-09-06 because MCP test cases returned incorrect results, and that identity case `13666371` was resolved on 2026-08-27.
- The exact rejection email and exact failing prompts are not present in this repository. Do not describe the five cases below as the original reviewer cases.
- Repository evidence did show a legacy review case for `octocat/Hello-World` whose expected result allowed either success or not-found. That ambiguous case has been replaced with deterministic known and explicitly missing fixtures.

## Current official requirements consulted

- [App review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Submission workflow](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy)

The implementation is checked against the following current requirements:

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
6. Upstream errors discarded safe retry metadata and could tempt callers to expose response bodies. The client now preserves only a bounded machine error code, status, and parsed `Retry-After` seconds.
7. `openWorldHint` was false although tools read a public, continuously changing catalog. It is now true; `readOnlyHint` remains true and `destructiveHint` remains false.
8. Review cases were vague and allowed multiple incompatible outcomes. They now specify exact calls, limits, filters, identities, and missing-record behavior.
9. Public setup docs diverged across Codex MCP, Claude, STDIO, and API-key fallback paths. User-facing docs now use the single confirmed plugin command:

   ```bash
   codex plugin marketplace add Arnon-hs/atlasrepo-mcp && codex plugin add atlasrepo@atlasrepo
   ```

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
- MCP tests: 20 passed, 0 failed.
- Build, protocol smoke, and packed-package smoke: passed.
- `npm audit --omit=dev`: 0 vulnerabilities after compatible transitive lockfile updates.
- Platform tests: 808 passed, 0 failed, 62 environment-gated tests skipped (870 total); production dependency audit: 0 vulnerabilities after compatible lockfile updates.
- Web tests: 549 passed, 0 failed; lint and production build passed.
- Playwright desktop and 390×844 checks: command, quota, reset, and connection rows rendered; no browser-console errors.

The deterministic Store scenarios are in `tests/store-readiness.test.ts`. They run entirely against an in-memory MCP transport and a closed fixture API:

| Scenario | Expected call/result |
| --- | --- |
| Semantic search | `atlasrepo_recommend`, `limit: 8`, exact semantic fixture |
| Vertical video | `atlasrepo_recommend`, `limit: 5`, exact video fixture |
| Video quality | `atlasrepo_search_tools`, `q: video`, `minQuality: 0.7` |
| Known repository | `atlasrepo_get_repository`, `MCPJam/inspector`, canonical URL and evidence |
| Missing repository | exact `atlasrepo-review-fixture/not-present-20260930`, stable not-found error |

Negative discovery cases cover unrelated calendar access, repository mutation, and unrelated rewriting. Protocol tests additionally cover malformed input, authorization boundary behavior, invalid upstream shapes, bounded outputs, and safe errors.

## Account quota and connection checks

Platform and Web changes are kept in their owning repositories:

- `GET /api/account/mcp-oauth` returns an additive `quota` object with `tier`, `plan`, `unit`, `limit`, `used`, `remaining`, `windowSeconds`, `resetAt`, and `unlimited`.
- Finite quotas use request units and the same authenticated-owner limiter key as remote MCP calls.
- Unlimited quotas use `limit: null`, `remaining: null`, `resetAt: null`, and `unlimited: true`; unknown/expired windows never invent a reset time.
- Connection rows remain filtered by `user_id`; OAuth scopes, revocation, access-token expiry, and refresh-token expiry are unchanged.
- The account UI renders finite, unlimited, unavailable, and API-error states without fabricating values.

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
