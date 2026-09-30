import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { AtlasRepoApiError, resourceClient } from "./client.js";
import { createAtlasRepoMcpServer } from "./server.js";

export function createAtlasRepoHttpApp(env: NodeJS.ProcessEnv = process.env) {
  const configuredHosts = (env.MCP_ALLOWED_HOSTS ?? "")
    .split(/[;,\s]+/)
    .map((host) => host.trim())
    .filter(Boolean);
  const allowedHosts = [...new Set(["127.0.0.1", "localhost", "mcp.atlasrepo.com", ...configuredHosts])];
  const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts });

  app.disable("x-powered-by");
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    app.get(path, (_request, response) => response.set("Cache-Control", "no-store").json({
      resource: "https://mcp.atlasrepo.com/mcp",
      authorization_servers: ["https://api.atlasrepo.com"],
      scopes_supported: ["mcp:read"], bearer_methods_supported: ["header"],
    }));
  }

  app.get("/livez", (_request, response) => {
    response.type("text/plain").send("ok");
  });

  app.get("/readyz", (_request, response) => {
    response.type("text/plain").send("ok");
  });

  app.get("/.well-known/openai-apps-challenge", (_request, response) => {
    const token = env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();
    if (!token) {
      response.sendStatus(404);
      return;
    }

    response
      .status(200)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .set("X-Content-Type-Options", "nosniff")
      .send(token);
  });

  app.post("/mcp", async (request, response) => {
    let client;
    try {
      const auth = request.headers.authorization;
      const count = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === "authorization").length;
      if (request.headers["x-api-key"] !== undefined || count > 1 ||
          (auth !== undefined && (!/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(auth) || auth.length > 4103))) {
        throw new AtlasRepoApiError("Invalid credentials", 401, "unauthorized");
      }
      if (Object.keys(request.query).length) throw new AtlasRepoApiError("Query parameters are not supported", 400, "invalid_request");
      client = resourceClient(env, auth?.slice(7));
      await client.validateAccess();
    } catch (error) {
      const status = error instanceof AtlasRepoApiError && [400, 401, 403].includes(error.status ?? 0) ? error.status! : 503;
      if (status === 401 || status === 403) response.set("WWW-Authenticate", `Bearer resource_metadata="https://mcp.atlasrepo.com/.well-known/oauth-protected-resource/mcp", scope="mcp:read", error="${status === 403 ? "insufficient_scope" : "invalid_token"}"`);
      response.status(status).set("Cache-Control", "no-store").json({ error: status === 401 ? "invalid_token" : status === 403 ? "insufficient_scope" : status === 400 ? "invalid_request" : "resource_unavailable" });
      return;
    }
    const server = createAtlasRepoMcpServer(client);
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
    } catch {
      process.stderr.write("AtlasRepo HTTP MCP request failed\n");
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
