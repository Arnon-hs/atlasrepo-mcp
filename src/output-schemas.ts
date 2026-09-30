import { isIP } from "node:net";
import { z } from "zod";

// Public projection, not an upstream-object passthrough. Unknown keys are stripped
// at every level; credentials in permitted text fields fail closed as well.
const credential = /(?:\b(?:authorization|password|secret|(?:access_|refresh_|api_)?token|api[_-]?key)\s*[:=]|\bBearer\s+\S+|\b(?:ar_mcp_|sk-live-|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]+)/i;
const text = (max: number) => z.string().max(max).refine(value => !credential.test(value), "Unsafe public text");
const identity = text(300).min(1);
const publicUrl = text(2000).url().refine(value => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
    !isIP(host.replace(/^\[|\]$/g, "")) && host.includes(".") &&
    !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) &&
    ![...url.searchParams.keys()].some(key => /token|secret|password|key|signature|credential|authorization/i.test(key));
}, "Expected a public citation URL without credentials");
const strings = z.array(text(2000)).max(50);
const access = z.enum(["anonymous", "paid", "admin"]);

const evidence = z.object({
  sourceUrl: publicUrl.optional(),
  quote: text(4000).optional(),
  note: text(4000).optional(),
});
const story = z.object({
  id: identity, slug: identity, title: text(1000).min(1),
  storyType: text(100).optional(),
  problemStatement: text(4000).optional(),
  resultSummary: text(4000).optional(),
  summaryEn: text(4000).optional(), summaryRu: text(4000).optional(), summaryZh: text(4000).optional(),
  tags: strings.optional(), sourceUrls: z.array(publicUrl).max(50).optional(),
  evidence: z.array(evidence).max(50).optional(),
});
const tool = z.object({
  id: identity, slug: identity, name: text(1000).min(1), kind: text(100).min(1),
  websiteUrl: publicUrl.optional(), repoUrl: publicUrl.optional(), docsUrl: publicUrl.optional(),
  license: text(300).optional(), activityStatus: text(100).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
});
const repo = z.object({
  id: identity, owner: identity, name: identity, url: publicUrl,
  title: text(1000).optional(), description: text(8000).optional(),
  language: text(100).optional(), topics: strings.optional(),
  stars: z.number().int().nonnegative().optional(), forks: z.number().int().nonnegative().optional(),
});
const linkedStory = z.object({
  id: identity, slug: identity, title: text(1000).min(1),
  summary_en: text(4000).optional(), summary_ru: text(4000).optional(), summary_zh: text(4000).optional(),
  tags: strings.optional(),
});
const solutionReview = z.object({
  contract: z.literal("atlas-solution-review.v1"), materialId: identity,
  sourceVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/), sourceVersionKind: z.literal("catalog_snapshot"),
  observedAt: z.string().datetime(), analyzedAt: z.string().datetime(),
  origin: z.enum(["automated", "authored"]), verification: z.literal("source_overview"),
  runtimeVerified: z.literal(false), freshness: z.enum(["current", "stale", "source_changed"]),
  description: text(2000), claimedUseCases: z.array(text(400)).max(5),
  sources: z.array(z.object({ title: text(300), url: publicUrl })).min(1).max(5),
  limitations: z.array(z.enum(["runtime_not_tested", "license_not_verified", "effectiveness_not_measured"])).max(3),
});

export const recommendResultSchema = z.object({ stories: z.array(story).max(10), access });
export const searchToolsResultSchema = z.object({ tools: z.array(tool).max(200), access });
export const repositoryResultSchema = z.object({
  repo, linkedStories: z.array(linkedStory).max(20), solutionReview: solutionReview.nullable().optional(), access,
});
