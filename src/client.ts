const DEFAULT_BASE_URL = "https://atlasrepo.com";
const DEFAULT_TIMEOUT_MS = 15_000;

type Fetch = typeof fetch;

export interface AtlasRepoClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: Fetch;
}

export interface RecommendationQuery {
  query: string;
  limit?: number;
}

export interface ToolQuery {
  q?: string | undefined;
  kind?: string | undefined;
  minQuality?: number | undefined;
}

export class AtlasRepoApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AtlasRepoApiError";
  }
}

export class AtlasRepoClient {
  readonly baseUrl: URL;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: Fetch;

  constructor(options: AtlasRepoClientOptions = {}) {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  recommend(input: RecommendationQuery): Promise<unknown> {
    return this.request("api/recommendations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  searchTools(input: ToolQuery): Promise<unknown> {
    const url = new URL("api/tools", this.baseUrl);
    if (input.q) url.searchParams.set("q", input.q);
    if (input.kind) url.searchParams.set("kind", input.kind);
    if (input.minQuality !== undefined) url.searchParams.set("minQuality", String(input.minQuality));
    return this.request(url);
  }

  getRepository(owner: string, name: string): Promise<unknown> {
    const path = `api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    return this.request(path);
  }

  private async request(pathOrUrl: string | URL, init: RequestInit = {}): Promise<unknown> {
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, this.baseUrl);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "network error";
      throw new AtlasRepoApiError(`AtlasRepo request failed: ${reason}`);
    }

    if (!response.ok) {
      throw new AtlasRepoApiError(
        `AtlasRepo API returned ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new AtlasRepoApiError("AtlasRepo API returned a non-JSON response", response.status);
    }

    return response.json();
  }
}

export function clientFromEnvironment(env: NodeJS.ProcessEnv = process.env): AtlasRepoClient {
  const configuredTimeout = Number(env.ATLASREPO_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;

  return new AtlasRepoClient({
    baseUrl: env.ATLASREPO_API_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs,
    ...(env.ATLASREPO_API_KEY ? { apiKey: env.ATLASREPO_API_KEY } : {}),
  });
}
