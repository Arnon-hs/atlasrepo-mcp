# AtlasRepo MCP

Public, read-only MCP connector for the AtlasRepo open-source decision catalog.

The server exposes compact tools for finding implementation evidence without
copying the full catalog into an agent context window.

## Connect in one command

Codex:

```sh
codex mcp add atlasrepo -- npx -y github:Arnon-hs/atlasrepo-mcp
```

Claude Code:

```sh
claude mcp add atlasrepo -- npx -y github:Arnon-hs/atlasrepo-mcp
```

These commands install the reviewed `main` branch directly from the public
repository. After the `@atlasrepo` npm scope is authenticated and the package
is published, `npx -y @atlasrepo/mcp` will be the shorter registry equivalent.

The repository also contains a Codex plugin bundle at `plugins/atlasrepo`.
Install it from a marketplace that points at this repository, or use the
one-command MCP setup above until the public plugin review is complete.

The default API is `https://atlasrepo.com`. Override it for development:

```sh
ATLASREPO_API_BASE_URL=http://localhost:8787 npx @atlasrepo/mcp
```

If the API requires authentication, set `ATLASREPO_API_KEY`. The connector is
read-only and never writes secrets or API responses to stderr.

## Tools

- `atlasrepo_recommend` — find evidence-backed projects and workflow stories
  for a concrete problem.
- `atlasrepo_search_tools` — search normalized tools by text, kind, and minimum
  quality score.
- `atlasrepo_get_repository` — load one repository decision record and its
  linked evidence.

## Development

```sh
npm ci
npm run check
npm test
npm run build
npm run smoke
```

The connector depends only on AtlasRepo's published REST contract. It contains
no private Scout, ranking, or ingestion implementation.

## Remote MCP for ChatGPT

ChatGPT connects to the Streamable HTTP endpoint rather than spawning a local
`npx` process. Build and run it with:

```sh
npm run build
MCP_ALLOWED_HOSTS=mcp.atlasrepo.com npm run start:http
```

Endpoints:

- `POST /mcp` — stateless Streamable HTTP MCP transport.
- `GET /livez` and `GET /readyz` — deployment health probes.

`MCP_ALLOWED_HOSTS` is a comma-separated allowlist. Keep the generated Zeabur
hostname in the list until the custom `mcp.atlasrepo.com` domain is active.
