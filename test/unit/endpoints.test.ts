import test from "node:test";
import assert from "node:assert/strict";

import { buildProjectBaseUrl, buildReadOnlyEndpoints, normalizeOrganization } from "../../src/core/endpoints.js";

test("normalizeOrganization accepts slug", () => {
  const normalized = normalizeOrganization("example-org");
  assert.equal(normalized.organizationSlug, "example-org");
  assert.equal(normalized.organizationUrl, "https://dev.azure.com/example-org");
});

test("normalizeOrganization accepts dev.azure.com URL", () => {
  const normalized = normalizeOrganization("https://dev.azure.com/example-org/");
  assert.equal(normalized.organizationSlug, "example-org");
  assert.equal(normalized.organizationUrl, "https://dev.azure.com/example-org");
});

test("normalizeOrganization rejects unsupported host", () => {
  assert.throws(() => normalizeOrganization("https://example.com/myorg"), /Unsupported Azure DevOps organization URL host/);
});

test("buildProjectBaseUrl encodes project", () => {
  const base = buildProjectBaseUrl({ organizationUrl: "https://dev.azure.com/example-org", project: "My Project" });
  assert.equal(base, "https://dev.azure.com/example-org/My%20Project");
});

test("buildReadOnlyEndpoints.getLog without range returns the simple log URL", () => {
  const endpoints = buildReadOnlyEndpoints({
    organizationUrl: "https://dev.azure.com/example-org",
    project: "MyProject",
  });
  const url = endpoints.getLog(101, 7);
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/example-org/MyProject/_apis/build/builds/101/logs/7");
  assert.equal(parsed.searchParams.get("startLine"), null);
  assert.equal(parsed.searchParams.get("endLine"), null);
  assert.equal(parsed.searchParams.get("api-version"), "7.1");
});

test("buildReadOnlyEndpoints.getLog with startLine/endLine encodes the range as query params", () => {
  const endpoints = buildReadOnlyEndpoints({
    organizationUrl: "https://dev.azure.com/example-org",
    project: "MyProject",
  });
  const url = endpoints.getLog(101, 7, { startLine: 200, endLine: 400 });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("startLine"), "200");
  assert.equal(parsed.searchParams.get("endLine"), "400");
  assert.equal(parsed.searchParams.get("api-version"), "7.1");
});

test("buildReadOnlyEndpoints.getLog accepts startLine alone (open-ended tail)", () => {
  const endpoints = buildReadOnlyEndpoints({
    organizationUrl: "https://dev.azure.com/example-org",
    project: "MyProject",
  });
  const url = endpoints.getLog(101, 7, { startLine: 5000 });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("startLine"), "5000");
  assert.equal(parsed.searchParams.get("endLine"), null);
});
