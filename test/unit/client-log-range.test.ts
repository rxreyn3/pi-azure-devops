import test from "node:test";
import assert from "node:assert/strict";

import { createAzureDevOpsClient } from "../../src/core/client.js";
import { createReadOnlyRestClient } from "../../src/core/rest.js";
import type { AzureDevOpsScope } from "../../src/core/models.js";

const scope: AzureDevOpsScope = {
  organizationSlug: "example-org",
  organizationUrl: "https://dev.azure.com/example-org",
  project: "MyProject",
};

interface CapturedRequest {
  url: string;
  method: string | undefined;
}

function makeStubFetch(body: string): { fetch: typeof fetch; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const stub: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, method: init?.method ?? "GET" });
    return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
  }) as typeof fetch;
  return { fetch: stub, calls };
}

test("rest.getText reports totalBytes and truncated when maxBytes truncates the body", async () => {
  const body = "x".repeat(500);
  const { fetch: stubFetch } = makeStubFetch(body);
  const rest = createReadOnlyRestClient({ token: "test", fetchImpl: stubFetch });

  const response = await rest.getText("https://example.invalid/log", { maxBytes: 100 });

  assert.equal(response.data.length, 100);
  assert.equal(response.totalBytes, 500);
  assert.equal(response.truncated, true);
});

test("rest.getText reports truncated=false when body fits under the cap", async () => {
  const body = "y".repeat(50);
  const { fetch: stubFetch } = makeStubFetch(body);
  const rest = createReadOnlyRestClient({ token: "test", fetchImpl: stubFetch });

  const response = await rest.getText("https://example.invalid/log", { maxBytes: 100 });

  assert.equal(response.data.length, 50);
  assert.equal(response.totalBytes, 50);
  assert.equal(response.truncated, false);
});

test("client.getLog returns LogFetchResult with content, totalBytes, returnedBytes, truncated", async () => {
  const body = "z".repeat(300);
  const { fetch: stubFetch } = makeStubFetch(body);
  const rest = createReadOnlyRestClient({ token: "test", fetchImpl: stubFetch });
  const client = createAzureDevOpsClient(scope, rest);

  const result = await client.getLog(101, 7, { maxBytes: 80 });

  assert.equal(result.content.length, 80);
  assert.equal(result.returnedBytes, 80);
  assert.equal(result.totalBytes, 300);
  assert.equal(result.truncated, true);
  assert.equal(result.startLine, undefined);
  assert.equal(result.endLine, undefined);
});

test("client.getLog defaults maxBytes to the centralized 8000 cap when caller omits it", async () => {
  const body = "a".repeat(10_000);
  const { fetch: stubFetch } = makeStubFetch(body);
  const rest = createReadOnlyRestClient({ token: "test", fetchImpl: stubFetch });
  const client = createAzureDevOpsClient(scope, rest);

  const result = await client.getLog(101, 7);

  assert.equal(result.content.length, 8_000);
  assert.equal(result.totalBytes, 10_000);
  assert.equal(result.truncated, true);
});

test("client.getLog forwards startLine/endLine to the request URL and echoes them on the result", async () => {
  const body = "tail content";
  const { fetch: stubFetch, calls } = makeStubFetch(body);
  const rest = createReadOnlyRestClient({ token: "test", fetchImpl: stubFetch });
  const client = createAzureDevOpsClient(scope, rest);

  const result = await client.getLog(101, 7, { maxBytes: 100, startLine: 5_000, endLine: 5_200 });

  assert.equal(calls.length, 1);
  const requestUrl = new URL(calls[0]!.url);
  assert.equal(requestUrl.searchParams.get("startLine"), "5000");
  assert.equal(requestUrl.searchParams.get("endLine"), "5200");
  assert.equal(result.startLine, 5_000);
  assert.equal(result.endLine, 5_200);
});
