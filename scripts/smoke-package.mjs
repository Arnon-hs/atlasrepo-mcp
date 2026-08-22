import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const tempRoot = mkdtempSync(join(tmpdir(), "atlasrepo-mcp-package-"));
let client;

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--pack-destination", tempRoot],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const tarballName = packOutput.trim().split(/\r?\n/).at(-1);
  assert.ok(tarballName, "npm pack did not return a tarball name");

  const installRoot = join(tempRoot, "install");
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installRoot,
      join(tempRoot, tarballName),
    ],
    { stdio: "inherit" },
  );

  const transport = new StdioClientTransport({
    command: join(installRoot, "node_modules", ".bin", "atlasrepo-mcp"),
    stderr: "pipe",
  });
  client = new Client({ name: "atlasrepo-package-smoke", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.listTools();
  assert.deepEqual(
    result.tools.map((tool) => tool.name).sort(),
    ["atlasrepo_get_repository", "atlasrepo_recommend", "atlasrepo_search_tools"],
  );
  process.stdout.write("Packed atlasrepo-mcp executable smoke test passed\n");
} finally {
  await client?.close();
  rmSync(tempRoot, { recursive: true, force: true });
}
