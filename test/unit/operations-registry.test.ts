import test from "node:test";
import assert from "node:assert/strict";

import {
  AZURE_DEVOPS_OPERATIONS,
  LOCAL_WRITE_AZURE_DEVOPS_OPERATIONS,
  READ_ONLY_AZURE_DEVOPS_OPERATIONS,
  findOperationByCliCommand,
} from "../../src/core/operations/registry.js";

const FORBIDDEN_TOOL_NAMES = [
  "azure_devops_queue_run",
  "azure_devops_cancel_run",
  "azure_devops_rerun",
  "azure_devops_preview_run",
];

test("registry contains the expected eight operations", () => {
  assert.equal(AZURE_DEVOPS_OPERATIONS.length, 8);
});

test("registry partitions operations by safety class", () => {
  assert.deepEqual(
    READ_ONLY_AZURE_DEVOPS_OPERATIONS.map((op) => op.tool.name),
    [
      "azure_devops_doctor",
      "azure_devops_get_status",
      "azure_devops_get_logs",
      "azure_devops_diagnose_failure",
      "azure_devops_list_artifacts",
      "azure_devops_list_pipelines",
      "azure_devops_list_builds",
    ],
  );
  assert.deepEqual(
    LOCAL_WRITE_AZURE_DEVOPS_OPERATIONS.map((op) => op.tool.name),
    ["azure_devops_download_artifact"],
  );
});

test("registry CLI commands match the public CLI surface", () => {
  const cliCommands = AZURE_DEVOPS_OPERATIONS
    .map((op) => op.cli.command)
    .filter((command) => command.length > 0)
    .sort();

  assert.deepEqual(cliCommands, [
    "artifacts",
    "artifacts download",
    "diagnose",
    "doctor",
    "logs",
    "status",
  ]);
});

test("findOperationByCliCommand resolves doctor and artifacts download", () => {
  assert.equal(findOperationByCliCommand("doctor")?.tool.name, "azure_devops_doctor");
  assert.equal(
    findOperationByCliCommand("artifacts download")?.tool.name,
    "azure_devops_download_artifact",
  );
  assert.equal(findOperationByCliCommand(""), undefined);
  assert.equal(findOperationByCliCommand("nonexistent"), undefined);
});

test("registry never registers forbidden remote-mutation tool names", () => {
  const toolNames = AZURE_DEVOPS_OPERATIONS.map((op) => op.tool.name);
  for (const forbidden of FORBIDDEN_TOOL_NAMES) {
    assert.equal(toolNames.includes(forbidden), false, `forbidden tool ${forbidden} present`);
  }
});

test("registry exposes safety metadata as a required field on every operation", () => {
  for (const op of AZURE_DEVOPS_OPERATIONS) {
    assert.equal(op.safety === "read-only" || op.safety === "local-write", true);
  }
});
