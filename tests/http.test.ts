import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createAtlasRepoHttpApp } from "../src/http-app.js";

test("Streamable HTTP endpoint initializes and exposes read-only tools", async (context) => {
  const listener = createAtlasRepoHttpApp().listen(0, "127.0.0.1");
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
  }

  const health = await fetch(`http://127.0.0.1:${port}/livez`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");
});
