# OpenAI Store readiness — 2026-09-30

Updated 2026-10-01. Status: **NOT READY FOR SUBMISSION. Canonical auth/shared quota fixes pass local PostgreSQL E2E; browser OAuth onboarding, semantic integration and actual ChatGPT client evidence remain blockers. Not submitted or approved.**

This report records reproducible evidence for AtlasRepo MCP and the Codex plugin bundle. It does not authorize a deployment, Store submission, or publication.

## Evidence boundaries

- Parent verified the September 6 rejection email for AtlasRepo v1.0.0. Its only specific reason was incorrect results in one or more submitted test cases. It requests rerunning all submitted cases, aligning actual behavior/output with documented expectations, and consistent ChatGPT web/mobile behavior. The email supplies no failed case IDs, inputs, logs, examples or attachments. This worker received the verified contents from parent, not a direct mailbox read.
- The task history separately reports identity case `13666371` resolved on August 27. That is not evidence identifying a failed MCP case.
- Auth/no-match defects found here are candidate defects, NOT proven causes of that rejection. The five new fixture cases below are not the original reviewer cases.
- Repository evidence did show a legacy review case for `octocat/Hello-World` whose expected result allowed either success or not-found. That ambiguous case has been replaced with deterministic known and explicitly missing fixtures.

### Recovered pre-review repository candidate

The full local Git history contains a [submission manifest at the September 5 release marker](https://github.com/Arnon-hs/atlasrepo-mcp/blob/36a0effa031e564a0c422d3ddc771fbef54e8782/chatgpt-app-submission.json).
Its blob is unchanged from the pre-readiness-pass manifest. It contains five
positive prompts: semantic search with PostgreSQL; vertical-video orchestration;
video tools with quality at least 0.7; orchestration-category tools without a text
query; and `octocat/Hello-World` evidence. Three negative prompts concern calendars,
merging/deleting a GitHub branch, and unrelated prose rewriting.

These are historical repository candidates, not a verified publisher export. The
rejected app ID was not found in available local Git history, and the repository
plugin version was 0.1.2, not the rejected Store version 1.0.0. Therefore neither
submission membership nor failed-case identity is established by Git alone.
Preserve and rerun all eight historical candidates after integration; in particular
the category-only scenario must not disappear when adding new known/missing repo
cases. Model tool selection and web/mobile consistency still require actual client
runs; a manifest metadata assertion or deterministic fixture does not prove them.

## Current official requirements consulted

- [App review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Submission workflow](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy)
- [Authentication](https://developers.openai.com/plugins/build/auth), checked again 2026-10-01: resource metadata belongs on the MCP origin, the authorization-server issuer must match discovery, and credentials require audience/scope/expiry checks. Existing DCR support is retained; this pass does not advertise unsupported CIMD or broaden scopes.

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

Local result updated 2026-10-01:

- TypeScript check: passed.
- MCP follow-up tests: 30 passed, 0 failed, including caller binding/discovery and boundary/stream/input tests.
- Build, protocol smoke, and packed-package smoke: passed.
- `npm audit --omit=dev`: 0 vulnerabilities after compatible transitive lockfile updates.
- Platform: TypeScript and 25 focused auth/quota/schema tests passed. Disposable PostgreSQL 17 + pgvector runs the complete actual migration chain and replay; 11 tests pass with two HTTP processes, public MCP adapter, synthetic owners, real SQL counters, consent/code/refresh/revocation, DB failures and projected catalog records. No production data or credentials used.
- Prior Web baseline: 549 tests passed; earlier 48 focused panel/App tests and production build passed. Reconnect follow-up: 6 panel tests and changed-file ESLint passed. Browser rendering evidence remains from the earlier mocked-data checks.
- Prior Playwright desktop and 390×844 checks used mocked API data. They prove rendering only, not actual quota or OAuth integration; repeat after integration.

The deterministic Store scenarios are in `tests/store-readiness.test.ts`. They run entirely against an in-memory MCP transport and a closed fixture API:

| Scenario | Expected call/result |
| --- | --- |
| Semantic search | `atlasrepo_recommend`, `limit: 8`, exact semantic fixture |
| Vertical video | `atlasrepo_recommend`, `limit: 5`, exact video fixture |
| Video quality | `atlasrepo_search_tools`, `q: video`, `minQuality: 0.7` |
| Known repository | `atlasrepo_get_repository`, `MCPJam/inspector`, canonical URL and evidence |
| Missing repository | exact `atlasrepo-review-fixture/not-present-20260930`, stable not-found error |

The three negative discovery cases are manifest metadata, NOT executed model-selection tests. Adapter fixtures cover malformed input, output shapes, bounded streams and safe errors. Separate private Platform PostgreSQL E2E tests execute actual OAuth and quota behavior; neither suite proves model tool selection, live ranking quality or ChatGPT/mobile consistency.

The backend reproduction command is `node scripts/test-mcp-postgres.mjs` from
the private Platform repository, with this MCP checkout as its sibling. The runner
initializes and destroys a temporary Unix-socket cluster and ignores production
DATABASE_URL. PostgreSQL17 with pgvector is required by existing migrations;
`MCP_TEST_PG_BIN` can select an installed binary directory. The new quota itself
needs only PostgreSQL, no Redis service or new runtime secret.

## Account quota and connection checks

Platform and Web changes are kept in their owning repositories:

- `GET /api/account/mcp-oauth` returns an additive `quota` object with `tier`, `plan`, `unit`, `limit`, `used`, `remaining`, `windowSeconds`, `resetAt`, and `unlimited`.
- Authenticated owner usage now comes from atomic PostgreSQL accounting, labeled `authoritative:true, source:postgres`. API keys, sessions and OAuth clients share one owner/minute bucket across replicas. Anonymous and ownerless configured static keys retain their existing local policy and are not presented as owner counters.
- One admitted MCP tool execution or metered catalog REST request is one request unit. Initialize/list/access/account reads are not tool calls. Invalid MCP identity/scope/input and quota denials do not debit; admitted execution failures do. Unlimited limit/remaining/reset are null, while used remains measured. Inactive finite reset is null.
- Connection rows remain filtered by `user_id`. Presentation distinguishes active, refresh_required, reconnect_required (legacy NULL audience), expired, revoked and unknown. SQL window counts cover all owner rows although only 50 are listed. Reconnection is user initiated; legacy audiences are not backfilled or automatically granted.
- The UI no longer calls a failed/loading fetch zero/not-connected, exposes quota units/windows when available, does not invent a meaning for null reset, and refreshes at expiry and every 30 seconds. Refreshable connections remain revocable.

## Security remediation and remaining release blockers

Implemented after user approval and integration-owner ACK: caller credential
binding without HTTP environment-key fallback; canonical audience and fixed issuer;
strict 401/403/503 paths; atomic owner quota; transactional code/refresh and family
revocation; strict legacy/public DTOs; session ownership/idle expiry; hidden restricted
backend handoff. Additive migration IDs are `202610010010_api_owner_quota_windows`
and `202610010011_mcp_resource_binding`. They preserve NULL audiences and do not
create grants. Read-only GPT-6 Astra review identified a legacy delayed-body expiry
race; the follow-up revalidates after body read and adds the corresponding PG/HTTP test.

1. The existing `/oauth/authorize` returns JSON login/consent instructions. No browser consent consumer was found in the reviewed Web tree. The PG suite manually drives consent; it does not prove ChatGPT/Codex browser onboarding. Coordinate the Web consent route/login flow with the integration owner before claiming reconnect works.
2. Canonical and legacy recommendation handlers now use honest literal catalog matching with empty no-match results. Main's grounded semantic implementation still needs integration and real relevance evidence. This task has not edited its owned `src/storage/stories.ts`; no fallback is asserted to be a proven rejection root cause.
3. All changes remain local pending one coordinated release. Live HTTPS/resource/issuer routing, inspector traces, supported client flows and the complete actual submitted-case set still require verification.

## Required checks before submission

These items require a coordinated staging/production release and therefore remain intentionally incomplete:

1. Deploy the reviewed commits together and confirm the deployed SHA for Web, Platform, and MCP.
2. Run MCP Inspector against the deployed public endpoint and save redacted evidence for all positive/error cases.
3. Connect the deployed plugin in each supported ChatGPT/Codex surface and verify stable desktop and mobile outputs.
4. Confirm OAuth consent, insufficient scope, expired access token, refresh-token expiry/revocation, owner isolation, and rate-limit reset behavior with dedicated non-production accounts.
5. Record and host the required reviewer walkthrough video; no review-video URL is present yet.
6. Compare the recovered historical manifest with an authorized read-only publisher export of the submitted v1.0.0 cases, if available. The verified rejection email contains no prompts. Rerun the complete confirmed submitted set and preserve traces without inventing reviewer case IDs or a root cause.
7. Re-run the live domain-verification and manifest rescan required by the submission UI.
8. Obtain explicit authorization before submitting or publishing. Passing this local suite does not imply OpenAI approval.
