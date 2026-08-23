import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;
}

test("Codex plugin uses the published npm package and clean legal routes", async () => {
  const mcp = await readJson("../plugins/atlasrepo/.mcp.json");
  const servers = mcp.mcpServers as Record<string, { args: string[] }>;
  assert.ok(servers.atlasrepo);
  assert.deepEqual(servers.atlasrepo.args, ["-y", "atlasrepo-mcp"]);

  const manifest = await readJson("../plugins/atlasrepo/.codex-plugin/plugin.json");
  const pluginInterface = manifest.interface as Record<string, unknown>;
  assert.equal(pluginInterface.privacyPolicyURL, "https://atlasrepo.com/legal?doc=privacy&lang=en");
  assert.equal(pluginInterface.termsOfServiceURL, "https://atlasrepo.com/legal?doc=terms&lang=en");
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
