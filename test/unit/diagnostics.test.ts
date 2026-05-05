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

test("collectBuildFailureDiagnostics resolves taskName selector to matched task and selected log", async () => {
  const diagnostics = await collectBuildFailureDiagnostics(createMockClient(), {
    buildId: 202,
    taskName: "Run Linter",
    maxBytes: 200,
  });

  assert.equal(diagnostics.matchedTaskRecord?.id, "task-run-linter");
  assert.equal(diagnostics.logs.selected.resolvedLogId, 3);
  assert.equal(diagnostics.logs.selected.resolvedLogSource, "timelineTask");
  assert.equal(diagnostics.logs.selected.taskLookup?.status, "matched");
  if (diagnostics.logs.selected.taskLookup?.status === "matched") {
    assert.equal(diagnostics.logs.selected.taskLookup.matchMode, "exact");
  }
});

test("collectBuildFailureDiagnostics surfaces ambiguous taskName without selecting a log or downloading content", async () => {
  const diagnostics = await collectBuildFailureDiagnostics(createMockClient(), {
    buildId: 202,
    taskName: "Run Tests",
    maxBytes: 200,
  });

  assert.equal(diagnostics.matchedTaskRecord, undefined);
  assert.equal(diagnostics.logs.selected.resolvedLogId, undefined);
  assert.equal(diagnostics.logs.selected.resolvedLogSource, undefined);
  assert.equal(diagnostics.logs.content, undefined);
  assert.equal(diagnostics.logs.excerpts.length, 0);
  assert.equal(diagnostics.logs.selected.taskLookup?.status, "ambiguous");
  if (diagnostics.logs.selected.taskLookup?.status === "ambiguous") {
    assert.equal(diagnostics.logs.selected.taskLookup.candidates.length, 2);
  }
});

test("collectBuildFailureDiagnostics surfaces noMatch selector and avoids first-log fallback", async () => {
  const diagnostics = await collectBuildFailureDiagnostics(createMockClient(), {
    buildId: 202,
    jobName: "does-not-exist",
    maxBytes: 200,
  });

  assert.equal(diagnostics.matchedJobRecord, undefined);
  assert.equal(diagnostics.logs.selected.resolvedLogId, undefined);
  assert.equal(diagnostics.logs.selected.jobLookup?.status, "noMatch");
});

test("collectBuildFailureDiagnostics records matched stage as context only without inferring a log", async () => {
  const diagnostics = await collectBuildFailureDiagnostics(createMockClient(), {
    buildId: 202,
    stageName: "Test",
    maxBytes: 200,
  });

  assert.equal(diagnostics.matchedStageRecord?.id, "stage-test");
  assert.equal(diagnostics.matchedJobRecord, undefined);
  assert.equal(diagnostics.matchedTaskRecord, undefined);
  assert.equal(diagnostics.logs.selected.resolvedLogId, undefined);
  assert.equal(diagnostics.logs.selected.resolvedLogSource, undefined);
  assert.equal(diagnostics.logs.selected.matchedStageRecordId, "stage-test");
  assert.match(diagnostics.summary, /stage Test/);
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
