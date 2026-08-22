import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { clientFromEnvironment } from "./client.js";
import { createAtlasRepoMcpServer } from "./server.js";

export function createAtlasRepoHttpApp(env: NodeJS.ProcessEnv = process.env) {
  const configuredHosts = (env.MCP_ALLOWED_HOSTS ?? "")
    .split(/[;,\s]+/)
    .map((host) => host.trim())
    .filter(Boolean);
  const allowedHosts = [...new Set(["127.0.0.1", "localhost", ...configuredHosts])];
  const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts });

  app.disable("x-powered-by");

  app.get("/livez", (_request, response) => {
    response.type("text/plain").send("ok");
  });

  app.get("/readyz", (_request, response) => {
    response.type("text/plain").send("ok");
  });

  app.post("/mcp", async (request, response) => {
    const server = createAtlasRepoMcpServer(clientFromEnvironment());
    const transport = new StreamableHTTPServerTransport();

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      // The SDK transport is structurally compatible; this cast only works around
      // its exactOptionalPropertyTypes declaration mismatch.
      await server.connect(transport as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown MCP request error";
      process.stderr.write(`AtlasRepo HTTP MCP request failed: ${message}\n`);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_request: unknown, response: { status: (code: number) => { json: (body: unknown) => void } }) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  };

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}
