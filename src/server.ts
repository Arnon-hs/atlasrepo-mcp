import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AtlasRepoApiError, AtlasRepoClient } from "./client.js";

const MAX_RESULT_CHARS = 40_000;

const recordSchema = z.record(z.string(), z.unknown());

const recommendResultSchema = z.object({
  stories: z.array(recordSchema).describe("Evidence-backed AtlasRepo recommendation records"),
  access: z.string().describe("Access tier used for this response"),
});
const recommendOutputSchema = recommendResultSchema.shape;

const searchToolsResultSchema = z.object({
  tools: z.array(recordSchema).describe("Normalized open-source tool records"),
  access: z.string().describe("Access tier used for this response"),
});
const searchToolsOutputSchema = searchToolsResultSchema.shape;

const repositoryResultSchema = z.object({
  repo: recordSchema.describe("AtlasRepo repository decision record"),
  linkedStories: z.array(recordSchema).describe("Published stories linked to the repository"),
  solutionReview: recordSchema.nullable().optional().describe("Evidence-backed AtlasRepo solution review when available"),
  access: z.string().describe("Access tier used for this response"),
});
const repositoryOutputSchema = repositoryResultSchema.shape;

function toolResult(value: unknown, schema: z.ZodType<Record<string, unknown>>) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return toolError(new AtlasRepoApiError("AtlasRepo API returned an invalid result shape", 502, "invalid_upstream_shape"));
  }

  const serialized = JSON.stringify(parsed.data, null, 2);
  if (serialized.length > MAX_RESULT_CHARS) {
    return toolError(new AtlasRepoApiError("AtlasRepo API result exceeded the connector response limit", 502, "result_too_large"));
  }
  return {
    content: [{ type: "text" as const, text: serialized }],
    structuredContent: parsed.data,
  };
}

function toolError(error: unknown) {
  const payload = error instanceof AtlasRepoApiError
    ? {
        error: error.code,
        message: error.message,
        ...(error.status ? { status: error.status } : {}),
        ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      }
    : { error: "connector_error", message: "AtlasRepo connector failed unexpectedly" };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

export function createAtlasRepoMcpServer(client: AtlasRepoClient): McpServer {
  const server = new McpServer({ name: "atlasrepo", version: "0.1.1" });

  server.registerTool(
    "atlasrepo_recommend",
    {
      title: "Recommend open-source solutions",
      description: "Use for a concrete engineering or content-production problem that needs evidence-backed repository or workflow options from the public AtlasRepo catalog. This read-only tool does not execute or modify repositories.",
      inputSchema: {
        query: z.string().trim().min(3).max(1_000).describe("Problem or outcome to solve"),
        limit: z.number().int().min(1).max(20).default(8).describe("Maximum recommendations"),
      },
      outputSchema: recommendOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }) => {
      try {
        return toolResult(await client.recommend({ query, limit }), recommendResultSchema);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "atlasrepo_search_tools",
    {
      title: "Search AtlasRepo tools",
      description: "Use to search public AtlasRepo tool records by text, kind, or normalized quality threshold. This read-only tool returns catalog records and does not install or run them.",
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
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return toolResult(await client.searchTools(input), searchToolsResultSchema);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "atlasrepo_get_repository",
    {
      title: "Get AtlasRepo repository evidence",
      description: "Use when the user names one GitHub owner and repository and wants its public AtlasRepo decision record and linked evidence. This read-only tool returns not found when the catalog has no matching record.",
      inputSchema: {
        owner: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
        name: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
      },
      outputSchema: repositoryOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, name }) => {
      try {
        return toolResult(await client.getRepository(owner, name), repositoryResultSchema);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
