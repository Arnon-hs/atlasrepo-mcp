import assert from "node:assert/strict";
import test from "node:test";

import { AtlasRepoApiError, AtlasRepoClient, clientFromEnvironment, MAX_RESPONSE_BYTES } from "../src/client.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("recommend sends a bounded JSON request with auth", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = new AtlasRepoClient({
    baseUrl: "https://example.test/root/",
    apiKey: "secret",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({ stories: [] });
    },
  });

  const result = await client.recommend({ query: "video orchestration", limit: 5 });

  assert.deepEqual(result, { stories: [] });
  assert.equal(capturedUrl, "https://example.test/root/api/recommendations");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(capturedInit?.redirect, "error");
  assert.equal(capturedInit?.body, '{"query":"video orchestration","limit":5}');
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authorization"), "Bearer secret");
});

test("searchTools encodes filters without inventing empty parameters", async () => {
  let capturedUrl = "";
  const client = new AtlasRepoClient({
    baseUrl: "https://example.test",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse({ tools: [] });
    },
  });

  await client.searchTools({ q: "vertical video", minQuality: 0.7 });

  const url = new URL(capturedUrl);
  assert.equal(url.pathname, "/api/tools");
  assert.equal(url.searchParams.get("q"), "vertical video");
  assert.equal(url.searchParams.get("minQuality"), "0.7");
  assert.equal(url.searchParams.has("kind"), false);
});

test("getRepository safely encodes path segments", async () => {
  let capturedUrl = "";
  const client = new AtlasRepoClient({
    baseUrl: "https://example.test",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return jsonResponse({ repository: {} });
    },
  });

  await client.getRepository("owner name", "repo/name");
  assert.equal(capturedUrl, "https://example.test/api/repos/owner%20name/repo%2Fname");
});

test("API failures expose status but not response bodies", async () => {
  const client = new AtlasRepoClient({
    fetchImpl: async () => new Response("internal secret", { status: 503, statusText: "Unavailable" }),
  });

  await assert.rejects(client.searchTools({ q: "test" }), (error: unknown) => {
    assert.ok(error instanceof AtlasRepoApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, "upstream_error");
    assert.equal(error.message, "AtlasRepo API returned HTTP 503");
    assert.equal(error.message.includes("internal secret"), false);
    return true;
  });
});

test("untrusted errors and status text never enter the stable public error", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("SYNTHETIC_SECRET network diagnostic"); },
    async () => new Response('{"error":"synthetic_secret"}', { status: 503, statusText: "SYNTHETIC_SECRET" }),
  ]) {
    const client = new AtlasRepoClient({ fetchImpl });
    await assert.rejects(client.searchTools({}), (error: unknown) => {
      assert.ok(error instanceof AtlasRepoApiError);
      assert.doesNotMatch(JSON.stringify({ message: error.message, code: error.code }), /synthetic_secret/i);
      return true;
    });
  }
});

test("streamed response is byte-bounded and cancelled without content-length", async () => {
  let cancelled = false;
  let reads = 0;
  const client = new AtlasRepoClient({ fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(8192)); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }) });
  await assert.rejects(client.searchTools({}), (error: unknown) => {
    assert.ok(error instanceof AtlasRepoApiError);
    assert.equal(error.code, "result_too_large");
    return true;
  });
  assert.equal(cancelled, true);
  assert.ok(reads <= MAX_RESPONSE_BYTES / 8192 + 2);
});

test("timeout includes a stalled response body and cancels its stream", async () => {
  let cancelled = false;
  const keepAlive = setInterval(() => undefined, 1000);
  try {
    const client = new AtlasRepoClient({ timeoutMs: 20, fetchImpl: async () => new Response(new ReadableStream({
      cancel() { cancelled = true; },
    }), { headers: { "content-type": "application/json" } }) });
    await assert.rejects(client.searchTools({}), (error: unknown) => {
      assert.ok(error instanceof AtlasRepoApiError);
      assert.equal(error.code, "upstream_timeout");
      assert.equal(error.status, 504);
      return true;
    });
    assert.equal(cancelled, true);
  } finally { clearInterval(keepAlive); }
});

test("error bodies are cancelled without reading and Retry-After is strict and bounded", async () => {
  for (const retry of ["12garbage", "9999999", "-1"]) {
    let cancelled = false;
    const client = new AtlasRepoClient({ fetchImpl: async () => new Response(new ReadableStream({
      cancel() { cancelled = true; },
    }), { status: 429, headers: { "retry-after": retry } }) });
    await assert.rejects(client.searchTools({}), (error: unknown) => {
      assert.ok(error instanceof AtlasRepoApiError);
      assert.equal(error.code, "rate_limited");
      assert.equal(error.retryAfterSeconds, undefined);
      return true;
    });
    assert.equal(cancelled, true);
  }
});

test("malformed JSON fails with a fixed shape error", async () => {
  const client = new AtlasRepoClient({ fetchImpl: async () => new Response("SYNTHETIC_SECRET", {
    headers: { "content-type": "application/json" },
  }) });
  await assert.rejects(client.searchTools({}), (error: unknown) => {
    assert.ok(error instanceof AtlasRepoApiError);
    assert.equal(error.code, "invalid_upstream_shape");
    assert.doesNotMatch(error.message, /SYNTHETIC_SECRET/);
    return true;
  });
});

test("dot segments cannot normalize a repository lookup into another API route", async () => {
  const client = new AtlasRepoClient({ fetchImpl: async () => { assert.fail("must not fetch"); } });
  for (const segment of [".", ".."]) await assert.rejects(client.getRepository(segment, "repo"));
});

test("API failures preserve only safe machine-readable error and retry metadata", async () => {
  const client = new AtlasRepoClient({
    fetchImpl: async () => new Response(JSON.stringify({ error: "rate_limited", detail: "private diagnostic" }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "content-type": "application/json", "retry-after": "12" },
    }),
  });

  await assert.rejects(client.searchTools({ q: "test" }), (error: unknown) => {
    assert.ok(error instanceof AtlasRepoApiError);
    assert.equal(error.code, "rate_limited");
    assert.equal(error.retryAfterSeconds, 12);
    assert.equal(error.message.includes("private diagnostic"), false);
    return true;
  });
});

test("environment factory falls back from an invalid timeout", () => {
  const client = clientFromEnvironment({
    ATLASREPO_API_BASE_URL: "https://example.test",
    ATLASREPO_REQUEST_TIMEOUT_MS: "not-a-number",
  });
  assert.equal(client.baseUrl.href, "https://example.test/");
});

test("environment factory uses the isolated public API by default", () => {
  const client = clientFromEnvironment({});
  assert.equal(client.baseUrl.href, "https://api.atlasrepo.com/");
});
