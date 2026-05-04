import test from "node:test";
import assert from "node:assert/strict";

import { createAzureDevOpsClient } from "../../src/core/client.js";
import { collectBuildFailureDiagnostics, extractLogExcerpts, redactDiagnosticsBundle } from "../../src/core/diagnostics.js";
import { createFixtureFetch } from "../../src/core/mock.js";
import { createReadOnlyRestClient } from "../../src/core/rest.js";
import { resolveScope } from "../../src/core/scope.js";

function createMockClient() {
  const scope = resolveScope({ organization: "mock-org", project: "mock-project" });
  const rest = createReadOnlyRestClient({ token: "mock-token", fetchImpl: createFixtureFetch(process.cwd()) });
  return createAzureDevOpsClient(scope, rest);
}

test("collectBuildFailureDiagnostics returns timeline/log/artifact evidence bundle", async () => {
  const diagnostics = await collectBuildFailureDiagnostics(createMockClient(), {
    buildId: 101,
    taskId: "task-1",
    maxBytes: 120,
  });

  assert.equal(diagnostics.buildId, 101);
  assert.equal(diagnostics.build?.result, "failed");
  assert.equal(diagnostics.timelineSummary.failedRecords, 3);
  assert.equal(diagnostics.failedRecords.length, 3);
  assert.equal(diagnostics.logs.selected.resolvedLogId, 2);
  assert.equal(diagnostics.logs.maxBytesApplied, 120);
  assert.equal(diagnostics.logs.excerpts.length > 0, true);
  assert.equal(diagnostics.artifacts.length, 2);
  assert.match(diagnostics.summary, /Build 101/i);
});

test("extractLogExcerpts deterministically captures marker windows", () => {
  const excerpts = extractLogExcerpts(
    [
      "[section]Starting: Compile",
      "warning TS6133: unused variable",
      "info continuing",
      "error TS2304: Cannot find name 'MissingType'",
      "[error]Build failed with exit code 1",
      "[section]Finishing: Compile",
    ].join("\n"),
    { contextLines: 1, maxExcerpts: 3 },
  );

  assert.equal(excerpts.length, 2);
  assert.equal(excerpts[0]?.marker, "warning");
  assert.equal(excerpts[0]?.lineNumber, 2);
  assert.equal(excerpts[1]?.marker, "error");
  assert.equal(excerpts[1]?.lineNumber, 4);
});

test("redactDiagnosticsBundle removes signed URLs and token-like values", () => {
  const redacted = redactDiagnosticsBundle(
    {
      artifacts: [{ downloadUrl: "https://example.invalid/drop?sig=abc123&token=secret" }],
      logs: { content: "Authorization: Bearer super-secret-value" },
    },
    ["super-secret-value"],
  );

  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes("abc123"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("super-secret-value"), false);
  assert.equal(serialized.includes("[REDACTED]"), true);
});
