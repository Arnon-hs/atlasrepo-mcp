import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  stderr: "pipe",
});
const client = new Client({ name: "atlasrepo-smoke", version: "0.1.0" });

try {
  await client.connect(transport);
  const result = await client.listTools();
  assert.deepEqual(
    result.tools.map((tool) => tool.name).sort(),
    ["atlasrepo_get_repository", "atlasrepo_recommend", "atlasrepo_search_tools"],
  );
  process.stdout.write("AtlasRepo MCP smoke test passed\n");
} finally {
  await client.close();
}
