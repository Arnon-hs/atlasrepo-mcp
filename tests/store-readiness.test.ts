import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { AtlasRepoClient } from "../src/client.js";
import { createAtlasRepoMcpServer } from "../src/server.js";

const semanticStory = {
  id: "story_semantic_postgres",
  slug: "semantic-search-postgres",
  title: "Semantic search over PostgreSQL documentation",
  sourceUrls: ["https://github.com/pgvector/pgvector"],
};
const videoStory = {
  id: "story_vertical_video",
  slug: "vertical-video-workflow",
  title: "Vertical video production workflow",
  sourceUrls: ["https://github.com/FFmpeg/FFmpeg"],
};
const videoTool = {
  id: "tool_ffmpeg",
  slug: "ffmpeg",
  name: "FFmpeg",
  kind: "video",
  qualityScore: 0.92,
  repoUrl: "https://github.com/FFmpeg/FFmpeg",
};
const repositoryResult = {
  repo: {
    id: "mcpjam/inspector",
    owner: "MCPJam",
    name: "inspector",
    url: "https://github.com/MCPJam/inspector",
  },
  linkedStories: [{ id: "story_mcp_testing", slug: "mcp-testing", title: "Testing MCP servers" }],
  solutionReview: null,
  access: "anonymous",
};

const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname === "/api/recommendations") {
    const body = JSON.parse(String(init?.body || "{}")) as { query?: string; limit?: number };
    const stories = (body.query?.includes("vertical-video") ? [videoStory]
      : body.query?.includes("semantic search") ? [semanticStory] : []).slice(0, body.limit ?? 8);
    return Response.json({ stories, access: "anonymous" });
  }
  if (url.pathname === "/api/tools") {
    const matches = (!url.searchParams.get("q") || "ffmpeg video".includes(url.searchParams.get("q")!)) &&
      (!url.searchParams.get("kind") || url.searchParams.get("kind") === videoTool.kind) &&
      Number(url.searchParams.get("minQuality") ?? 0) <= videoTool.qualityScore;
    return Response.json({ tools: matches ? [videoTool] : [], access: "anonymous" });
  }
  if (url.pathname === "/api/repos/MCPJam/inspector") {
    return Response.json(repositoryResult);
  }
  if (url.pathname === "/api/repos/atlasrepo-review-fixture/not-present-20260930") {
    return Response.json({ error: "repo_not_found" }, { status: 404, statusText: "Not Found" });
  }
  return Response.json({ error: "unexpected_fixture_request" }, { status: 500, statusText: "Fixture Error" });
};

const textPayload = (result: unknown): Record<string, unknown> => {
  const payload = result as { content?: unknown };
  assert.ok(Array.isArray(payload.content));
  const content = payload.content[0] as { type?: string; text?: string } | undefined;
  assert.equal(content?.type, "text");
  return JSON.parse(content.text || "{}") as Record<string, unknown>;
};

test("five adapter fixture scenarios have exact outcomes (not live ranking or model-selection proof)", async (context) => {
  const server = createAtlasRepoMcpServer(new AtlasRepoClient({ baseUrl: "https://fixture.invalid", fetchImpl: fixtureFetch }));
  const client = new Client({ name: "atlasrepo-store-readiness", version: "1.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => { await client.close(); await server.close(); });

  const semantic = await client.callTool({
    name: "atlasrepo_recommend",
    arguments: { query: "semantic search over product documentation and PostgreSQL", limit: 8 },
  });
  assert.deepEqual(semantic.structuredContent, { stories: [semanticStory], access: "anonymous" });

  const video = await client.callTool({
    name: "atlasrepo_recommend",
    arguments: { query: "vertical-video production workflow", limit: 5 },
  });
  assert.deepEqual(video.structuredContent, { stories: [videoStory], access: "anonymous" });

  const tools = await client.callTool({
    name: "atlasrepo_search_tools",
    arguments: { q: "video", minQuality: 0.7 },
  });
  assert.deepEqual(tools.structuredContent, { tools: [videoTool], access: "anonymous" });

  const repository = await client.callTool({
    name: "atlasrepo_get_repository",
    arguments: { owner: "MCPJam", name: "inspector" },
  });
  assert.deepEqual(repository.structuredContent, repositoryResult);

  const missing = await client.callTool({
    name: "atlasrepo_get_repository",
    arguments: { owner: "atlasrepo-review-fixture", name: "not-present-20260930" },
  });
  assert.equal(missing.isError, true);
  assert.deepEqual(textPayload(missing), {
    error: "repo_not_found",
    message: "AtlasRepo API returned HTTP 404",
    status: 404,
  });

  const unmatched = await client.callTool({ name: "atlasrepo_recommend", arguments: { query: "absent-fixture-topic" } });
  assert.deepEqual(unmatched.structuredContent, { stories: [], access: "anonymous" });
  const filtered = await client.callTool({ name: "atlasrepo_search_tools", arguments: { q: "video", minQuality: 0.99 } });
  assert.deepEqual(filtered.structuredContent, { tools: [], access: "anonymous" });
});

test("review manifest contains five positive and three negative cases with precise tool expectations", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugins/atlasrepo/.codex-plugin/plugin.json", import.meta.url), "utf8"));
  const cases = manifest.extensions["com.openai"].review.test_cases;
  assert.equal(cases.positive.length, 5);
  assert.equal(cases.negative.length, 3);
  for (const entry of cases.positive) {
    assert.match(entry.tools_triggered, /^atlasrepo_(recommend|search_tools|get_repository)$/);
    assert.ok(entry.expected_behavior.length >= 80);
  }
  for (const entry of cases.negative) {
    assert.equal("tools_triggered" in entry, false);
  }
});
