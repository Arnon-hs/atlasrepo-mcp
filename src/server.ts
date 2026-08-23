import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AtlasRepoApiError, AtlasRepoClient } from "./client.js";

const MAX_RESULT_CHARS = 40_000;

const recordSchema = z.record(z.string(), z.unknown());

const recommendOutputSchema = {
  stories: z.array(recordSchema).describe("Evidence-backed AtlasRepo recommendation records"),
  access: z.string().describe("Access tier used for this response"),
};

const searchToolsOutputSchema = {
  tools: z.array(recordSchema).describe("Normalized open-source tool records"),
  access: z.string().describe("Access tier used for this response"),
};

const repositoryOutputSchema = {
  repo: recordSchema.describe("AtlasRepo repository decision record"),
  linkedStories: z.array(recordSchema).describe("Published stories linked to the repository"),
  access: z.string().describe("Access tier used for this response"),
};

function toolResult(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return toolError(new Error("AtlasRepo API returned an invalid result shape"));
  }

  const serialized = JSON.stringify(value, null, 2);
  const text = serialized.length <= MAX_RESULT_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_RESULT_CHARS)}\n... response truncated by AtlasRepo MCP`;
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: value as Record<string, unknown>,
  };
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
  const server = new McpServer({ name: "atlasrepo", version: "0.1.1" });

  server.registerTool(
    "atlasrepo_recommend",
    {
      title: "Recommend open-source solutions",
      description: "Find evidence-backed repositories and workflows for a concrete engineering or content-production problem.",
      inputSchema: {
        query: z.string().trim().min(3).max(1_000).describe("Problem or outcome to solve"),
        limit: z.number().int().min(1).max(20).default(8).describe("Maximum recommendations"),
      },
      outputSchema: recommendOutputSchema,
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
      outputSchema: searchToolsOutputSchema,
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
      outputSchema: repositoryOutputSchema,
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
