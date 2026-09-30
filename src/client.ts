const DEFAULT_BASE_URL = "https://api.atlasrepo.com";
const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 128 * 1024;

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
  constructor(
    message: string,
    readonly status?: number,
    readonly code = "upstream_error",
    readonly retryAfterSeconds?: number,
  ) {
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
    if ([owner, name].some(value => value === "." || value === "..")) {
      return Promise.reject(new AtlasRepoApiError("Invalid repository identity", 400, "invalid_input"));
    }
    const path = `api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    return this.request(path);
  }

  private async request(pathOrUrl: string | URL, init: RequestInit = {}): Promise<unknown> {
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, this.baseUrl);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);

    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal,
        // A redirect must never carry caller credentials to another endpoint.
        redirect: "error",
      });

      if (!response.ok) {
        // Neither bodies nor statusText are trusted error messages/codes. Do not
        // read error bodies at all (they may be unbounded or contain secrets).
        void response.body?.cancel().catch(() => undefined);
        const rawRetry = response.headers.get("retry-after") ?? "";
        const retry = /^\d{1,7}$/.test(rawRetry) ? Number(rawRetry) : undefined;
        const code = response.status === 401 ? "unauthorized"
          : response.status === 403 ? "forbidden"
          : response.status === 429 ? "rate_limited"
          : response.status === 404 ? (url.pathname.includes("/api/repos/") ? "repo_not_found" : "not_found")
          : "upstream_error";
        throw new AtlasRepoApiError(`AtlasRepo API returned HTTP ${response.status}`, response.status, code,
          response.status === 429 && retry !== undefined && retry <= 86400 ? retry : undefined);
      }

      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
        void response.body?.cancel().catch(() => undefined);
        throw new AtlasRepoApiError("AtlasRepo API returned a non-JSON response", 502, "invalid_upstream_shape");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new AtlasRepoApiError("AtlasRepo API returned an invalid result shape", 502, "invalid_upstream_shape");
      let abortHandler: (() => void) | undefined;
      const aborted = new Promise<never>((_resolve, reject) => {
        abortHandler = () => reject(new AtlasRepoApiError("AtlasRepo request timed out", 504, "upstream_timeout"));
        if (signal.aborted) abortHandler();
        else signal.addEventListener("abort", abortHandler, { once: true });
      });
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) {
            throw new AtlasRepoApiError("AtlasRepo API result exceeded the connector response limit", 502, "result_too_large");
          }
          chunks.push(value);
        }
      } finally {
        if (abortHandler) signal.removeEventListener("abort", abortHandler);
        void reader.cancel().catch(() => undefined);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new AtlasRepoApiError("AtlasRepo API returned an invalid result shape", 502, "invalid_upstream_shape");
      }
    } catch (error) {
      if (error instanceof AtlasRepoApiError) throw error;
      throw signal.aborted
        ? new AtlasRepoApiError("AtlasRepo request timed out", 504, "upstream_timeout")
        : new AtlasRepoApiError("AtlasRepo request failed", 502, "upstream_unavailable");
    }
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
