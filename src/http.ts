#!/usr/bin/env node

import { createAtlasRepoHttpApp } from "./http-app.js";

const parsedPort = Number(process.env.PORT ?? "8080");
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 8080;

const app = createAtlasRepoHttpApp();
const listener = app.listen(port, "0.0.0.0", () => {
  process.stdout.write(`AtlasRepo Streamable HTTP MCP listening on port ${port}\n`);
});

function shutdown(signal: string): void {
  process.stdout.write(`AtlasRepo HTTP MCP received ${signal}; shutting down\n`);
  listener.close((error) => {
    if (error) {
      process.stderr.write(`AtlasRepo HTTP MCP shutdown failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
