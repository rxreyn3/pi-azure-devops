import test from "node:test";
import assert from "node:assert/strict";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import azureDevopsExtension from "../../src/extension/index.js";
import {
  runDiagnoseFailureTool,
  runDoctorTool,
  runGetLogsTool,
  runGetStatusTool,
  runListArtifactsTool,
  runListBuildsTool,
  runListPipelinesTool,
} from "../../src/extension/tools/handlers.js";
import { READ_ONLY_AZURE_DEVOPS_TOOL_NAMES } from "../../src/extension/tools/index.js";

test("azure_devops_doctor mock mode resolves without credentials", async () => {
  const result = await runDoctorTool({ mock: true }, { cwd: process.cwd(), env: {} });

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.auth.tokenFound, false);
  assert.equal(result.details.readyForReadOnlyLive, false);
  assert.equal(result.details.warnings.some((warning) => warning.includes("Mock mode enabled")), true);
});

test("azure_devops_get_status mock mode returns timeline and selected log mapping", async () => {
  const result = await runGetStatusTool(
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
  const result = await runGetLogsTool(
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
  const result = await runListArtifactsTool(
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
  const result = await runDiagnoseFailureTool(
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

test("azure_devops_list_pipelines mock mode returns read-only summaries and clamps top", async () => {
  const result = await runListPipelinesTool({ mock: true, top: 500 }, { cwd: process.cwd(), env: {} });

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.topApplied, 50);
  assert.equal(result.details.pipelines.length > 0, true);
});

test("azure_devops_list_builds mock mode returns read-only summaries and clamps top", async () => {
  const result = await runListBuildsTool({ mock: true, top: 500 }, { cwd: process.cwd(), env: {} });

  assert.equal(result.details.mode, "mock");
  assert.equal(result.details.topApplied, 50);
  assert.equal(result.details.builds.length > 0, true);
});

test("default extension export registers the read-only tool set", () => {
  const registeredNames: string[] = [];
  const fakePi = {
    registerTool(tool: { name: string }) {
      registeredNames.push(tool.name);
    },
  } as unknown as ExtensionAPI;

  azureDevopsExtension(fakePi);

  assert.deepEqual(registeredNames, READ_ONLY_AZURE_DEVOPS_TOOL_NAMES);
});

test("read-only extension tool registration excludes mutation tool names", () => {
  assert.deepEqual(READ_ONLY_AZURE_DEVOPS_TOOL_NAMES, [
    "azure_devops_doctor",
    "azure_devops_get_status",
    "azure_devops_get_logs",
    "azure_devops_diagnose_failure",
    "azure_devops_list_artifacts",
    "azure_devops_list_pipelines",
    "azure_devops_list_builds",
  ]);

  const forbidden = ["azure_devops_queue_run", "azure_devops_cancel_run", "azure_devops_rerun", "azure_devops_preview_run"];
  for (const forbiddenName of forbidden) {
    assert.equal(READ_ONLY_AZURE_DEVOPS_TOOL_NAMES.includes(forbiddenName), false);
  }
});
