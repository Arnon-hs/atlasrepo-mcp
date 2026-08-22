#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { clientFromEnvironment } from "./client.js";
import { createAtlasRepoMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = createAtlasRepoMcpServer(clientFromEnvironment());
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  process.stderr.write(`AtlasRepo MCP failed to start: ${message}\n`);
  process.exitCode = 1;
});
