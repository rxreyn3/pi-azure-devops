import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import azureDevopsExtension from "../../src/extension/index.js";
import {
  runDiagnoseFailureOperation,
  runDoctorOperation,
  runDownloadArtifactOperation,
  runGetLogsOperation,
  runGetStatusOperation,
  runListArtifactsOperation,
  runListBuildsOperation,
  runListPipelinesOperation,
} from "../../src/core/operations/runners.js";
import {
  AZURE_DEVOPS_TOOL_NAMES,
  LOCAL_WRITE_AZURE_DEVOPS_TOOL_NAMES,
  READ_ONLY_AZURE_DEVOPS_TOOL_NAMES,
} from "../../src/extension/tools/index.js";

test("azure_devops_doctor mock mode resolves without credentials", async () => {
  const result = await runDoctorOperation({ mock: true }, { cwd: process.cwd(), env: {} });

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.auth.tokenFound, false);
  assert.equal(result.details.readyForReadOnlyLive, false);
  assert.equal(result.details.warnings.some((warning) => warning.includes("Mock mode enabled")), true);
});

test("azure_devops_get_status mock mode returns timeline and selected log mapping", async () => {
  const result = await runGetStatusOperation(
    {
      mock: true,
      buildId: 101,
      jobId: "job-1",
      taskId: "task-1",
    },
    { cwd: process.cwd(), env: {} },
  );

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.timeline.totalRecords > 0, true);
  assert.equal(result.details.selected.resolvedLogId, 2);
  assert.equal(result.details.selected.resolvedLogSource, "timelineTask");
});

test("azure_devops_get_logs mock mode returns bounded content and selected log metadata", async () => {
  const result = await runGetLogsOperation(
    {
      mock: true,
      buildId: 101,
      taskId: "task-1",
      maxBytes: 40,
    },
    { cwd: process.cwd(), env: {} },
  );

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.selected.resolvedLogId, 2);
  assert.equal(result.details.selectedLog?.id, 2);
  assert.equal(result.details.maxBytesApplied, 40);
  assert.equal((result.details.content ?? "").length <= 40, true);
});

test("azure_devops_list_artifacts mock mode redacts signed URLs and stays metadata-only", async () => {
  const result = await runListArtifactsOperation(
    {
      mock: true,
      buildId: 101,
    },
    { cwd: process.cwd(), env: {} },
  );

  const serialized = JSON.stringify(result.details);
  assert.equal(serialized.includes("mock-signature"), false);
  assert.equal(result.details.artifacts[0]?.downloadUrl?.includes("sig=[REDACTED]"), true);
  assert.equal(result.details.noDownloadSemantics.includes("does not download"), true);
});

test("azure_devops_diagnose_failure mock mode returns bundled evidence and redacts signed URLs", async () => {
  const result = await runDiagnoseFailureOperation(
    {
      mock: true,
      buildId: 101,
      taskId: "task-1",
      maxBytes: 200,
    },
    { cwd: process.cwd(), env: {} },
  );

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.diagnostics.buildId, 101);
  assert.equal(result.details.diagnostics.logs.selected.resolvedLogId, 2);
  assert.equal(result.details.diagnostics.logs.excerpts.length > 0, true);

  const serialized = JSON.stringify(result.details);
  assert.equal(serialized.includes("mock-signature"), false);
  assert.equal(serialized.includes("sig=[REDACTED]"), true);
});

test("azure_devops_get_status accepts stageName/jobName/taskName and exposes lookup metadata", async () => {
  const result = await runGetStatusOperation(
    {
      mock: true,
      buildId: 202,
      stageName: "Test",
      jobName: "Test Suite",
      taskName: "Run Linter",
    },
    { cwd: process.cwd(), env: {} },
  );

  assert.equal(result.details.selected.matchedStageRecordId, "stage-test");
  assert.equal(result.details.selected.matchedJobRecordId, "job-test-suite");
  assert.equal(result.details.selected.matchedTaskRecordId, "task-run-linter");
  assert.equal(result.details.selected.resolvedLogId, 3);
  assert.equal(result.details.selected.resolvedLogSource, "timelineTask");
  assert.equal(result.details.selected.taskLookup?.status, "matched");
});

test("azure_devops_get_logs returns ambiguous selector candidates and omits content", async () => {
  const result = await runGetLogsOperation(
    {
      mock: true,
      buildId: 202,
      taskName: "Run Tests",
      maxBytes: 80,
    },
    { cwd: process.cwd(), env: {} },
  );

  assert.equal(result.details.selected.resolvedLogId, undefined);
  assert.equal(result.details.content, undefined);
  assert.equal(result.details.selected.taskLookup?.status, "ambiguous");
  if (result.details.selected.taskLookup?.status === "ambiguous") {
    assert.equal(result.details.selected.taskLookup.candidates.length, 2);
  }
});

test("azure_devops_diagnose_failure accepts taskName and matched evidence appears in details", async () => {
  const result = await runDiagnoseFailureOperation(
    {
      mock: true,
      buildId: 202,
      taskName: "Run Linter",
      maxBytes: 200,
    },
    { cwd: process.cwd(), env: {} },
  );

  assert.equal(result.details.diagnostics.matchedTaskRecord?.id, "task-run-linter");
  assert.equal(result.details.diagnostics.logs.selected.resolvedLogId, 3);
  assert.equal(result.details.diagnostics.logs.selected.resolvedLogSource, "timelineTask");
});

test("azure_devops_list_pipelines mock mode returns read-only summaries and clamps top", async () => {
  const result = await runListPipelinesOperation({ mock: true, top: 500 }, { cwd: process.cwd(), env: {} });

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.topApplied, 50);
  assert.equal(result.details.pipelines.length > 0, true);
});

test("azure_devops_list_builds mock mode returns read-only summaries and clamps top", async () => {
  const result = await runListBuildsOperation({ mock: true, top: 500 }, { cwd: process.cwd(), env: {} });

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.topApplied, 50);
  assert.equal(result.details.builds.length > 0, true);
});

test("default extension export registers all read-only and local-write tools", () => {
  const registeredNames: string[] = [];
  const fakePi = {
    registerTool(tool: { name: string }) {
      registeredNames.push(tool.name);
    },
  } as unknown as ExtensionAPI;

  azureDevopsExtension(fakePi);

  assert.deepEqual(registeredNames, AZURE_DEVOPS_TOOL_NAMES);
});

test("extension tool registration excludes remote mutation tool names but includes the local-write download tool", () => {
  assert.deepEqual(READ_ONLY_AZURE_DEVOPS_TOOL_NAMES, [
    "azure_devops_doctor",
    "azure_devops_get_status",
    "azure_devops_get_logs",
    "azure_devops_diagnose_failure",
    "azure_devops_list_artifacts",
    "azure_devops_list_pipelines",
    "azure_devops_list_builds",
  ]);
  assert.deepEqual(LOCAL_WRITE_AZURE_DEVOPS_TOOL_NAMES, ["azure_devops_download_artifact"]);
  assert.deepEqual(AZURE_DEVOPS_TOOL_NAMES, [
    ...READ_ONLY_AZURE_DEVOPS_TOOL_NAMES,
    ...LOCAL_WRITE_AZURE_DEVOPS_TOOL_NAMES,
  ]);

  const forbidden = ["azure_devops_queue_run", "azure_devops_cancel_run", "azure_devops_rerun", "azure_devops_preview_run"];
  for (const forbiddenName of forbidden) {
    assert.equal(AZURE_DEVOPS_TOOL_NAMES.includes(forbiddenName), false);
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("azure_devops_download_artifact mock preview without confirm writes nothing and redacts signed URLs", async () => {
  const cwd = await makeTempDir("ext-download-preview-");
  const result = await runDownloadArtifactOperation(
    {
      mock: true,
      buildId: 101,
      artifactName: "logs",
      outputPath: "out/logs.zip",
      artifactKind: "build",
    },
    { cwd, env: {} },
  );

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.outcome.status, "preview");
  if (result.details.outcome.status === "preview") {
    assert.equal(result.details.outcome.requiresConfirmation, true);
    assert.equal(result.details.outcome.resolvedArtifactKind, "build");
  }
  assert.equal(existsSync(path.join(cwd, "out", "logs.zip")), false);

  const serialized = JSON.stringify(result.details);
  assert.equal(serialized.includes("mock-build-zip-signature"), false);
  assert.equal(serialized.includes("mock-pipeline-zip-signature"), false);
});

test("azure_devops_download_artifact mock confirm writes build artifact ZIP under cwd", async () => {
  const cwd = await makeTempDir("ext-download-build-");
  const result = await runDownloadArtifactOperation(
    {
      mock: true,
      buildId: 101,
      artifactName: "drop",
      outputPath: "out/drop.zip",
      artifactKind: "build",
      confirm: true,
    },
    { cwd, env: {} },
  );

  assert.equal(result.details.outcome.status, "downloaded");
  if (result.details.outcome.status === "downloaded") {
    assert.equal(result.details.outcome.resolvedArtifactKind, "build");
  }
  const written = await readFile(path.join(cwd, "out", "drop.zip"));
  assert.equal(written.byteLength > 0, true);

  const serialized = JSON.stringify(result.details);
  assert.equal(serialized.includes("mock-build-zip-signature"), false);
});

test("azure_devops_download_artifact mock confirm writes pipeline artifact ZIP via signed-content flow", async () => {
  const cwd = await makeTempDir("ext-download-pipeline-");
  const result = await runDownloadArtifactOperation(
    {
      mock: true,
      buildId: 101,
      artifactName: "pipeline-only",
      outputPath: "out/pipeline-only.zip",
      artifactKind: "pipeline",
      confirm: true,
    },
    { cwd, env: {} },
  );

  assert.equal(result.details.outcome.status, "downloaded");
  if (result.details.outcome.status === "downloaded") {
    assert.equal(result.details.outcome.resolvedArtifactKind, "pipeline");
    assert.equal(result.details.outcome.pipelineId, 301);
    assert.equal(result.details.outcome.runId, 101);
  }
  assert.equal(existsSync(path.join(cwd, "out", "pipeline-only.zip")), true);

  const serialized = JSON.stringify(result.details);
  assert.equal(serialized.includes("mock-pipeline-zip-signature"), false);
});

test("azure_devops_download_artifact mock without confirm performs no writes even when artifactKind is pipeline", async () => {
  const cwd = await makeTempDir("ext-download-pipeline-preview-");
  const result = await runDownloadArtifactOperation(
    {
      mock: true,
      buildId: 101,
      artifactName: "pipeline-only",
      outputPath: "out/pipeline-only.zip",
      artifactKind: "pipeline",
    },
    { cwd, env: {} },
  );

  assert.equal(result.details.outcome.status, "preview");
  assert.equal(existsSync(path.join(cwd, "out", "pipeline-only.zip")), false);
});
