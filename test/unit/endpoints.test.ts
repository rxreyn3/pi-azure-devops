import test from "node:test";
import assert from "node:assert/strict";

import { buildProjectBaseUrl, normalizeOrganization } from "../../src/core/endpoints.js";

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
