import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { AtlasRepoClient } from "../src/client.js";
import { createAtlasRepoHttpApp } from "../src/http-app.js";
import { createAtlasRepoMcpServer } from "../src/server.js";

test("Streamable HTTP endpoint initializes and exposes read-only tools", async (context) => {
  const challengeToken = "openai-domain-verification-token";
  const listener = createAtlasRepoHttpApp({
    ...process.env,
    OPENAI_APPS_CHALLENGE_TOKEN: ` ${challengeToken} `,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    listener.once("listening", resolve);
    listener.once("error", reject);
  });
  context.after(() => new Promise<void>((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  }));

  const { port } = listener.address() as AddressInfo;
  const client = new Client({ name: "atlasrepo-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport as Parameters<typeof client.connect>[0]);
  context.after(() => client.close());

  const result = await client.listTools();
  assert.deepEqual(
    result.tools.map((tool) => tool.name),
    ["atlasrepo_recommend", "atlasrepo_search_tools", "atlasrepo_get_repository"],
  );
  for (const tool of result.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.openWorldHint, false);
    assert.ok(tool.outputSchema, `${tool.name} must declare an output schema`);
  }

  const health = await fetch(`http://127.0.0.1:${port}/livez`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");

  const challenge = await fetch(`http://127.0.0.1:${port}/.well-known/openai-apps-challenge`);
  assert.equal(challenge.status, 200);
  assert.match(challenge.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(challenge.headers.get("cache-control"), "no-store");
  assert.equal(await challenge.text(), challengeToken);
});

test("domain verification challenge is unavailable without a configured token", async (context) => {
  const listener = createAtlasRepoHttpApp({}).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    listener.once("listening", resolve);
    listener.once("error", reject);
  });
  context.after(() => new Promise<void>((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  }));

  const { port } = listener.address() as AddressInfo;
  const challenge = await fetch(`http://127.0.0.1:${port}/.well-known/openai-apps-challenge`);
  assert.equal(challenge.status, 404);
});

test("tool calls return structured content matching the declared output schema", async (context) => {
  const upstreamResult = {
    tools: [{ id: "tool_example", name: "example/project", kind: "github_repo" }],
    access: "anonymous",
  };
  const atlasRepoClient = new AtlasRepoClient({
    fetchImpl: async () => new Response(JSON.stringify(upstreamResult), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  const server = createAtlasRepoMcpServer(atlasRepoClient);
  const client = new Client({ name: "atlasrepo-structured-output-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "atlasrepo_search_tools",
    arguments: { q: "semantic search" },
  });

  assert.deepEqual(result.structuredContent, upstreamResult);
  assert.equal(result.isError, undefined);
});
