import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("spike mock json summary is healthy", async () => {
  const { stdout, stderr } = await execFileAsync("node", [
    "--import",
    "tsx",
    "spikes/ado-rest-spike.ts",
    "--mock",
    "--build-id",
    "101",
    "--job-id",
    "job-1",
    "--task-id",
    "task-1",
    "--json",
  ], {
    cwd: process.cwd(),
    env: process.env,
  });

  assert.equal(stderr, "");
  const parsed = JSON.parse(stdout) as { summary: { failed: number }; selected: { resolvedLogId?: number; resolvedLogSource?: string } };
  assert.equal(parsed.summary.failed, 0);
  assert.equal(parsed.selected.resolvedLogId, 2);
  assert.equal(parsed.selected.resolvedLogSource, "timelineTask");
});
