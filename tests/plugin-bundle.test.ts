import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;
}

test("Codex plugin uses the public Streamable HTTP server and complete review metadata", async () => {
  const mcp = await readJson("../plugins/atlasrepo/.mcp.json");
  const servers = mcp.mcpServers as Record<string, { url: string }>;
  assert.ok(servers.atlasrepo);
  assert.equal(servers.atlasrepo.url, "https://mcp.atlasrepo.com/mcp");

  const manifest = await readJson("../plugins/atlasrepo/.codex-plugin/plugin.json");
  const pluginInterface = manifest.interface as Record<string, unknown>;
  assert.equal(pluginInterface.supportURL, "https://github.com/Arnon-hs/atlasrepo-mcp/issues");
  assert.equal(pluginInterface.privacyPolicyURL, "https://atlasrepo.com/legal?doc=privacy&lang=en");
  assert.equal(pluginInterface.termsOfServiceURL, "https://atlasrepo.com/legal?doc=terms&lang=en");
  assert.equal(pluginInterface.composerIcon, "./assets/atlasrepo-mark.svg");
  assert.equal(pluginInterface.logo, "./assets/atlasrepo-mark.svg");
  const review = ((manifest.extensions as Record<string, unknown>)["com.openai"] as Record<string, unknown>).review as Record<string, unknown>;
  const testCases = review.test_cases as { positive: unknown[]; negative: unknown[] };
  assert.equal(testCases.positive.length, 5);
  assert.equal(testCases.negative.length, 3);
});

test("repository marketplace exposes the AtlasRepo plugin", async () => {
  const marketplace = await readJson("../.agents/plugins/marketplace.json");
  assert.equal(marketplace.name, "atlasrepo");
  const [entry] = marketplace.plugins as Array<Record<string, unknown>>;
  assert.ok(entry);
  assert.equal(entry.name, "atlasrepo");
  assert.deepEqual(entry.source, { source: "local", path: "./plugins/atlasrepo" });
  assert.deepEqual(entry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
});
