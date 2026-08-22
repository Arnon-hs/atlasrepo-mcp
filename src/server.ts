import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AtlasRepoApiError, AtlasRepoClient } from "./client.js";

const MAX_RESULT_CHARS = 40_000;

function toolResult(value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  const text = serialized.length <= MAX_RESULT_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_RESULT_CHARS)}\n... response truncated by AtlasRepo MCP`;
  return { content: [{ type: "text" as const, text }] };
}

function toolError(error: unknown) {
  const message = error instanceof AtlasRepoApiError
    ? error.message
    : "AtlasRepo connector failed unexpectedly";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createAtlasRepoMcpServer(client: AtlasRepoClient): McpServer {
  const server = new McpServer({ name: "atlasrepo", version: "0.1.0" });

  server.registerTool(
    "atlasrepo_recommend",
    {
      title: "Recommend open-source solutions",
      description: "Find evidence-backed repositories and workflows for a concrete engineering or content-production problem.",
      inputSchema: {
        query: z.string().trim().min(3).max(1_000).describe("Problem or outcome to solve"),
        limit: z.number().int().min(1).max(20).default(8).describe("Maximum recommendations"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      try {
        return toolResult(await client.recommend({ query, limit }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "atlasrepo_search_tools",
    {
      title: "Search AtlasRepo tools",
      description: "Search normalized open-source tools by text, kind, and quality threshold.",
      inputSchema: {
        q: z.string().trim().max(300).optional().describe("Free-text search"),
        kind: z.string().trim().max(100).optional().describe("Tool kind or category"),
        minQuality: z.number().min(0).max(1).optional().describe("Minimum normalized quality score"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return toolResult(await client.searchTools(input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "atlasrepo_get_repository",
    {
      title: "Get AtlasRepo repository evidence",
      description: "Load the AtlasRepo decision record and linked evidence for one GitHub repository.",
      inputSchema: {
        owner: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
        name: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ owner, name }) => {
      try {
        return toolResult(await client.getRepository(owner, name));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
