import test from "node:test";
import assert from "node:assert/strict";

import { runCli } from "../../src/cli/index.js";

function createCapture() {
  let output = "";
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    },
    getOutput() {
      return output;
    },
  };
}

test("pi-ado doctor --mock --json works without token", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(["doctor", "--mock", "--json"], {
    stdout: stdoutCapture.stream,
    stderr: stderrCapture.stream,
    env: {},
    cwd: process.cwd(),
  });

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as { auth: { tokenFound: boolean } };
  assert.equal(parsed.auth.tokenFound, false);
});

test("pi-ado status --mock --json returns selected log mapping", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(["status", "--mock", "--build-id", "101", "--job-id", "job-1", "--task-id", "task-1", "--json"], {
    stdout: stdoutCapture.stream,
    stderr: stderrCapture.stream,
    env: {},
    cwd: process.cwd(),
  });

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as { selected: { resolvedLogId?: number; resolvedLogSource?: string } };
  assert.equal(parsed.selected.resolvedLogId, 2);
  assert.equal(parsed.selected.resolvedLogSource, "timelineTask");
});

test("pi-ado diagnose --mock --json returns diagnostics bundle with redacted artifact URLs", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(["diagnose", "--mock", "--build-id", "101", "--task-id", "task-1", "--max-bytes", "120", "--json"], {
    stdout: stdoutCapture.stream,
    stderr: stderrCapture.stream,
    env: {},
    cwd: process.cwd(),
  });

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");
  assert.equal(stdoutCapture.getOutput().includes("mock-signature"), false);

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    diagnostics: {
      buildId: number;
      logs: { selected: { resolvedLogId?: number } };
      artifacts: Array<{ downloadUrl?: string }>;
    };
  };

  assert.equal(parsed.diagnostics.buildId, 101);
  assert.equal(parsed.diagnostics.logs.selected.resolvedLogId, 2);
  assert.equal(parsed.diagnostics.artifacts[0]?.downloadUrl, "https://example.invalid/artifact/drop?sig=[REDACTED]");
});

test("pi-ado artifacts --mock --json redacts signed download URLs", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(["artifacts", "--mock", "--build-id", "101", "--json"], {
    stdout: stdoutCapture.stream,
    stderr: stderrCapture.stream,
    env: {},
    cwd: process.cwd(),
  });

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");
  assert.equal(stdoutCapture.getOutput().includes("mock-signature"), false);

  const parsed = JSON.parse(stdoutCapture.getOutput()) as { artifacts: Array<{ downloadUrl?: string }> };
  assert.equal(parsed.artifacts[0]?.downloadUrl, "https://example.invalid/artifact/drop?sig=[REDACTED]");
});
