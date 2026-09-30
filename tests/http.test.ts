import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createServer } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { AtlasRepoClient } from "../src/client.js";
import { createAtlasRepoHttpApp } from "../src/http-app.js";
import { createAtlasRepoMcpServer } from "../src/server.js";

test("Streamable HTTP endpoint initializes and exposes read-only tools", async (context) => {
  const upstream = createServer((_req,res) => { res.setHeader("content-type","application/json"); res.end(JSON.stringify({resource:"https://mcp.atlasrepo.com/mcp"})); });
  await new Promise<void>(r => upstream.listen(0,"127.0.0.1",r));
  context.after(() => new Promise<void>(r => upstream.close(() => r())));
  const challengeToken = "openai-domain-verification-token";
  const listener = createAtlasRepoHttpApp({
    ATLASREPO_API_BASE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
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
    assert.equal(tool.annotations?.openWorldHint, true);
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
    tools: [{ id: "tool_example", slug: "example-project", name: "example/project", kind: "github_repo" }],
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

test("HTTP app uses its injected upstream environment", async (context) => {
  let requestedUrl = "";
  const upstream = await import("node:http").then(({ createServer }) => createServer((request, response) => {
    requestedUrl = request.url || "";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url === "/api/mcp/resource/access" ? {resource:"https://mcp.atlasrepo.com/mcp"} : { tools: [], access: "anonymous" }));
  }));
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => upstream.close(() => resolve())));
  const upstreamPort = (upstream.address() as AddressInfo).port;

  const listener = createAtlasRepoHttpApp({ ATLASREPO_API_BASE_URL: `http://127.0.0.1:${upstreamPort}` }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  context.after(() => new Promise<void>((resolve) => listener.close(() => resolve())));

  const port = (listener.address() as AddressInfo).port;
  const client = new Client({ name: "atlasrepo-http-env-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)) as Parameters<typeof client.connect>[0]);
  context.after(() => client.close());
  const result = await client.callTool({ name: "atlasrepo_search_tools", arguments: { q: "mcp" } });

  assert.equal(result.isError, undefined);
  assert.equal(requestedUrl, "/api/mcp/resource/invoke");
});

test("HTTP caller binding, metadata, strict invalid-token errors and no environment-key impersonation", async context => {
  const seen: Array<string | undefined> = [];
  const upstream = createServer((req,res) => {
    seen.push(req.headers.authorization);
    res.setHeader("content-type","application/json");
    if (req.headers.authorization === "Bearer invalid") { res.writeHead(401).end('{"secret":"must not be echoed"}'); return; }
    if (req.headers.authorization === "Bearer scope") { res.writeHead(403).end('{}'); return; }
    res.end(JSON.stringify({resource:"https://mcp.atlasrepo.com/mcp"}));
  });
  await new Promise<void>(r => upstream.listen(0,"127.0.0.1",r));
  context.after(() => new Promise<void>(r => upstream.close(() => r())));
  const listener = createAtlasRepoHttpApp({ATLASREPO_API_BASE_URL:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,ATLASREPO_API_KEY:"SERVER_KEY_MUST_NOT_FORWARD"}).listen(0,"127.0.0.1");
  await new Promise<void>(r=>listener.once("listening",r));
  context.after(() => new Promise<void>(r => listener.close(() => r())));
  const base=`http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  for (const path of ["/.well-known/oauth-protected-resource","/.well-known/oauth-protected-resource/mcp"]) {
    const metadata=await (await fetch(base+path)).json();
    assert.equal(metadata.resource,"https://mcp.atlasrepo.com/mcp");
    assert.deepEqual(metadata.authorization_servers,["https://api.atlasrepo.com"]);
  }
  const post=(authorization?:string)=>fetch(base+"/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream",...(authorization?{authorization}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"test",version:"1"}}})});
  const anonymous=await post(); assert.equal(anonymous.status,200); await anonymous.text();
  const valid=await post("Bearer caller"); assert.equal(valid.status,200); await valid.text();
  assert.deepEqual(seen,[undefined,"Bearer caller"]);
  for (const [auth,status] of [["Bearer invalid",401],["Bearer scope",403],["Basic bad",401]] as const) {
    const result=await post(auth); assert.equal(result.status,status);
    assert.match(result.headers.get("www-authenticate")!,/resource_metadata/);
    assert.ok(!(await result.text()).includes("secret"));
  }
});

test("oversized structured results fail closed instead of bypassing the text limit", async (context) => {
  const atlasRepoClient = new AtlasRepoClient({
    fetchImpl: async () => new Response(JSON.stringify({
      tools: Array.from({ length: 100 }, (_, index) => ({ id: String(index), slug: String(index), name: "x".repeat(500), kind: "test" })),
      access: "anonymous",
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const server = createAtlasRepoMcpServer(atlasRepoClient);
  const client = new Client({ name: "atlasrepo-bounds-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => { await client.close(); await server.close(); });

  const result = await client.callTool({ name: "atlasrepo_search_tools", arguments: { q: "large" } });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.ok(Array.isArray(result.content));
  const content = result.content[0] as { type?: string; text?: string } | undefined;
  assert.equal(content?.type, "text");
  assert.equal(JSON.parse(content.text || "{}").error, "result_too_large");
});

test("invalid upstream shapes return a stable machine-readable error", async (context) => {
  const atlasRepoClient = new AtlasRepoClient({
    fetchImpl: async () => new Response(JSON.stringify({ unexpected: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  const server = createAtlasRepoMcpServer(atlasRepoClient);
  const client = new Client({ name: "atlasrepo-shape-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => { await client.close(); await server.close(); });

  const result = await client.callTool({ name: "atlasrepo_recommend", arguments: { query: "semantic search" } });
  assert.equal(result.isError, true);
  assert.ok(Array.isArray(result.content));
  const content = result.content[0] as { type?: string; text?: string } | undefined;
  assert.equal(content?.type, "text");
  assert.deepEqual(JSON.parse(content.text || "{}"), {
    error: "invalid_upstream_shape",
    message: "AtlasRepo API returned an invalid result shape",
    status: 502,
  });
});
