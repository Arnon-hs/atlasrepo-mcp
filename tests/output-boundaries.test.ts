import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AtlasRepoClient } from "../src/client.js";
import { createAtlasRepoMcpServer } from "../src/server.js";

const story = { id: "s1", slug: "cited-workflow", title: "A published workflow",
  sourceUrls: ["https://github.com/FFmpeg/FFmpeg"],
  evidence: [{ sourceUrl: "https://github.com/FFmpeg/FFmpeg", quote: "Published source description" }] };
const tool = { id: "t1", slug: "ffmpeg", name: "FFmpeg", kind: "video", repoUrl: "https://github.com/FFmpeg/FFmpeg" };
const repo = { id: "r1", owner: "FFmpeg", name: "FFmpeg", url: "https://github.com/FFmpeg/FFmpeg" };

test("MCP projects nested public DTOs, retains exact evidence and drops private fields in text and structured output", async context => {
  let payload: unknown;
  const server = createAtlasRepoMcpServer(new AtlasRepoClient({ fetchImpl: async () => Response.json(payload) }));
  const client = new Client({ name: "output-boundary", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => { await client.close(); await server.close(); });
  const secret = { access_token: "SYNTHETIC_SECRET", internal_trace: "SYNTHETIC_SECRET" };
  const cases = [
    { name: "atlasrepo_recommend", arguments: { query: "published workflow" },
      upstream: { stories: [{ ...story, metadata: secret, adminVersion: 77,
        evidence: [{ ...story.evidence[0], ...secret }] }], access: "anonymous", ...secret },
      expected: { stories: [story], access: "anonymous" } },
    { name: "atlasrepo_search_tools", arguments: {},
      upstream: { tools: [{ ...tool, metadata: secret }], access: "paid", ...secret },
      expected: { tools: [tool], access: "paid" } },
    { name: "atlasrepo_get_repository", arguments: { owner: "FFmpeg", name: "FFmpeg" },
      upstream: { repo: { ...repo, moderationReason: "SYNTHETIC_SECRET" },
        linkedStories: [{ id: "s1", slug: "linked", title: "Linked evidence", localized: secret }], access: "admin" },
      expected: { repo, linkedStories: [{ id: "s1", slug: "linked", title: "Linked evidence" }], access: "admin" } },
  ];
  for (const scenario of cases) {
    payload = scenario.upstream;
    const result = await client.callTool({ name: scenario.name, arguments: scenario.arguments });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, scenario.expected);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_SECRET|metadata|adminVersion|moderationReason/);
  }
});

test("MCP fails closed on invalid nested records, unknown tiers and credential-bearing public fields", async context => {
  let payload: unknown;
  const server = createAtlasRepoMcpServer(new AtlasRepoClient({ fetchImpl: async () => Response.json(payload) }));
  const client = new Client({ name: "invalid-output-boundary", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => { await client.close(); await server.close(); });
  for (const invalid of [
    { stories: [{}], access: "anonymous" },
    { stories: [story], access: "made_up_tier" },
    { stories: [{ ...story, title: "authorization: SYNTHETIC_SECRET" }], access: "anonymous" },
    ...["https://user:SYNTHETIC_SECRET@github.com/repo", "https://github.com/repo?access_token=SYNTHETIC_SECRET",
      "http://127.0.0.1/admin", "http://169.254.169.254/metadata", "file:///private/file"].map(url => ({
      stories: [{ ...story, sourceUrls: [url] }], access: "anonymous",
    })),
  ]) {
    payload = invalid;
    const result = await client.callTool({ name: "atlasrepo_recommend", arguments: { query: "workflow" } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_SECRET/);
    assert.match(JSON.stringify(result), /invalid_upstream_shape/);
  }
});

test("invalid tool inputs fail before upstream I/O and an empty catalog is an honest empty result", async context => {
  let calls = 0;
  const server = createAtlasRepoMcpServer(new AtlasRepoClient({ fetchImpl: async () => {
    calls++; return Response.json({ stories: [], access: "anonymous" });
  } }));
  const client = new Client({ name: "input-boundary", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => { await client.close(); await server.close(); });
  for (const invalid of [
    { name: "atlasrepo_recommend", arguments: { query: "workflow", limit: 11 } },
    { name: "atlasrepo_recommend", arguments: { query: "x" } },
    { name: "atlasrepo_get_repository", arguments: { owner: "..", name: "admin" } },
    { name: "atlasrepo_search_tools", arguments: { minQuality: 1.5 } },
  ]) assert.equal((await client.callTool(invalid)).isError, true);
  assert.equal(calls, 0);
  const empty = await client.callTool({ name: "atlasrepo_recommend", arguments: { query: "no catalog evidence" } });
  assert.deepEqual(empty.structuredContent, { stories: [], access: "anonymous" });
  assert.equal(calls, 1);
});
