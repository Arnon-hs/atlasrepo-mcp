# AtlasRepo MCP boundary

This public repository contains only the read-only MCP adapter for AtlasRepo's
published HTTP API. Do not copy Scout ranking, ingestion, admin, billing,
authentication, database, or proprietary monolith implementation into it.

- Keep stdout reserved for MCP protocol traffic.
- Never log credentials or raw API response bodies.
- Bound inputs, request timeouts, and result sizes.
- Preserve explicit `.js` suffixes in TypeScript ESM imports.
- Every change must pass `npm run check`, `npm test`, `npm run build`,
  `npm run smoke`, and `npm audit --omit=dev`.
