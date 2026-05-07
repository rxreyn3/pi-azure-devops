import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

test("pi-ado status --mock --json with --job-name and --task-name returns selector lookup mapping", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    [
      "status",
      "--mock",
      "--build-id",
      "202",
      "--job-name",
      "Test Suite",
      "--task-name",
      "Run Linter",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    selected: {
      resolvedLogId?: number;
      resolvedLogSource?: string;
      matchedJobRecordId?: string;
      matchedTaskRecordId?: string;
      jobLookup?: { status: string };
      taskLookup?: { status: string; matchMode?: string };
    };
  };
  assert.equal(parsed.selected.matchedJobRecordId, "job-test-suite");
  assert.equal(parsed.selected.matchedTaskRecordId, "task-run-linter");
  assert.equal(parsed.selected.resolvedLogId, 3);
  assert.equal(parsed.selected.resolvedLogSource, "timelineTask");
  assert.equal(parsed.selected.taskLookup?.status, "matched");
  assert.equal(parsed.selected.taskLookup?.matchMode, "exact");
});

test("pi-ado logs --mock --json with --task-name returns bounded content for an unambiguous task", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    ["logs", "--mock", "--build-id", "202", "--task-name", "Run Linter", "--json"],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    selected: { resolvedLogId?: number; resolvedLogSource?: string };
    content?: string;
  };
  assert.equal(parsed.selected.resolvedLogId, 3);
  assert.equal(parsed.selected.resolvedLogSource, "timelineTask");
  assert.equal(typeof parsed.content, "string");
  assert.equal((parsed.content ?? "").length > 0, true);
});

test("pi-ado logs --mock --json with ambiguous --task-name returns candidates and omits content", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    ["logs", "--mock", "--build-id", "202", "--task-name", "Run Tests", "--json"],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    selected: {
      resolvedLogId?: number;
      taskLookup?: { status: string; matchMode?: string; candidates?: Array<{ id: string }> };
    };
    content?: string;
  };
  assert.equal(parsed.selected.resolvedLogId, undefined);
  assert.equal(parsed.content, undefined);
  assert.equal(parsed.selected.taskLookup?.status, "ambiguous");
  assert.equal(parsed.selected.taskLookup?.matchMode, "exact");
  assert.equal(parsed.selected.taskLookup?.candidates?.length, 2);
});

test("pi-ado logs --mock --json with ambiguous --task-name still honors explicit --log-id", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    [
      "logs",
      "--mock",
      "--build-id",
      "202",
      "--task-name",
      "Run Tests",
      "--log-id",
      "5",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    selected: { resolvedLogId?: number; resolvedLogSource?: string };
  };
  assert.equal(parsed.selected.resolvedLogId, 5);
  assert.equal(parsed.selected.resolvedLogSource, "explicit");
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
async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("pi-ado artifacts download --mock without --confirm returns preview and writes nothing", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-preview-");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "logs",
      "--output",
      "out/logs.zip",
      "--artifact-kind",
      "build",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    outcome: {
      status: string;
      requiresConfirmation?: boolean;
      wouldWrite?: string[];
      resolvedArtifactKind?: string;
    };
  };
  assert.equal(parsed.outcome.status, "preview");
  assert.equal(parsed.outcome.requiresConfirmation, true);
  assert.equal(parsed.outcome.resolvedArtifactKind, "build");
  assert.equal(existsSync(path.join(cwd, "out", "logs.zip")), false);
});

test("pi-ado artifacts download --mock --confirm writes ZIP for build artifact", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-build-write-");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "drop",
      "--output",
      "out/drop.zip",
      "--artifact-kind",
      "build",
      "--confirm",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    outcome: {
      status: string;
      resolvedArtifactKind?: string;
      bytesDownloaded?: number;
      writtenFiles?: string[];
    };
  };
  assert.equal(parsed.outcome.status, "downloaded");
  assert.equal(parsed.outcome.resolvedArtifactKind, "build");
  assert.equal((parsed.outcome.bytesDownloaded ?? 0) > 0, true);
  assert.equal(parsed.outcome.writtenFiles?.length, 1);

  const zipPath = path.join(cwd, "out", "drop.zip");
  const zipBytes = await readFile(zipPath);
  assert.equal(zipBytes.byteLength, parsed.outcome.bytesDownloaded);

  // Mock-signature pattern must not appear in CLI output.
  assert.equal(stdoutCapture.getOutput().includes("mock-build-zip-signature"), false);
});

test("pi-ado artifacts download --mock --confirm with --artifact-kind pipeline writes ZIP via signed-content flow", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-pipeline-write-");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "pipeline-only",
      "--output",
      "out/pipeline-only.zip",
      "--artifact-kind",
      "pipeline",
      "--confirm",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    outcome: {
      status: string;
      resolvedArtifactKind?: string;
      pipelineId?: number;
      runId?: number;
    };
  };
  assert.equal(parsed.outcome.status, "downloaded");
  assert.equal(parsed.outcome.resolvedArtifactKind, "pipeline");
  assert.equal(parsed.outcome.pipelineId, 301);
  assert.equal(parsed.outcome.runId, 101);

  const zipPath = path.join(cwd, "out", "pipeline-only.zip");
  assert.equal(existsSync(zipPath), true);

  assert.equal(stdoutCapture.getOutput().includes("mock-pipeline-zip-signature"), false);
});

test("pi-ado artifacts download --mock --confirm --extract writes extracted files", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-extract-");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "drop",
      "--output",
      "out/drop",
      "--artifact-kind",
      "build",
      "--confirm",
      "--extract",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    outcome: {
      status: string;
      writtenFiles?: string[];
    };
  };
  assert.equal(parsed.outcome.status, "extracted");

  const readme = await readFile(path.join(cwd, "out", "drop", "drop", "README.txt"), "utf8");
  assert.equal(readme, "build artifact drop\n");
});

test("pi-ado artifacts download --mock auto returns ambiguity preview without writes", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-auto-ambig-");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "drop",
      "--output",
      "out/drop.zip",
      "--confirm",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    outcome: {
      status: string;
      resolution?: { status: string };
    };
  };
  assert.equal(parsed.outcome.status, "preview");
  assert.equal(parsed.outcome.resolution?.status, "ambiguous");
  assert.equal(existsSync(path.join(cwd, "out", "drop.zip")), false);
});

test("pi-ado artifacts download refuses absolute output path", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-absolute-output-");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "drop",
      "--output",
      "/etc/passwd",
      "--artifact-kind",
      "build",
      "--confirm",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 1);
  assert.match(stderrCapture.getOutput(), /relative/);
});

test("pi-ado artifacts download refuses to overwrite existing file without --overwrite", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();
  const cwd = await makeTempDir("cli-artifact-overwrite-refuse-");
  await mkdir(path.join(cwd, "out"), { recursive: true });
  await writeFile(path.join(cwd, "out", "drop.zip"), "existing");

  const code = await runCli(
    [
      "artifacts",
      "download",
      "--mock",
      "--build-id",
      "101",
      "--artifact-name",
      "drop",
      "--output",
      "out/drop.zip",
      "--artifact-kind",
      "build",
      "--confirm",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd,
    },
  );

  assert.equal(code, 1);
  assert.match(stderrCapture.getOutput(), /Refusing to overwrite/);
});

test("pi-ado logs --mock --max-bytes truncates content and reports contentTruncated/contentTotalBytes", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    [
      "logs",
      "--mock",
      "--build-id",
      "202",
      "--task-name",
      "Run Linter",
      "--max-bytes",
      "30",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  assert.equal(stderrCapture.getOutput(), "");

  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    content?: string;
    contentTotalBytes?: number;
    contentTruncated?: boolean;
  };
  assert.equal(typeof parsed.content, "string");
  assert.equal((parsed.content ?? "").length, 30);
  assert.equal(parsed.contentTruncated, true);
  assert.equal(typeof parsed.contentTotalBytes, "number");
  assert.equal(parsed.contentTotalBytes! > 30, true);
});

test("pi-ado logs --mock with sufficient --max-bytes reports contentTruncated=false", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    [
      "logs",
      "--mock",
      "--build-id",
      "202",
      "--task-name",
      "Run Linter",
      "--max-bytes",
      "100000",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    content?: string;
    contentTotalBytes?: number;
    contentTruncated?: boolean;
  };
  assert.equal(parsed.contentTruncated, false);
  assert.equal((parsed.content ?? "").length, parsed.contentTotalBytes);
});

test("pi-ado logs --mock --start-line and --end-line echo into the payload", async () => {
  const stdoutCapture = createCapture();
  const stderrCapture = createCapture();

  const code = await runCli(
    [
      "logs",
      "--mock",
      "--build-id",
      "202",
      "--task-name",
      "Run Linter",
      "--start-line",
      "100",
      "--end-line",
      "200",
      "--json",
    ],
    {
      stdout: stdoutCapture.stream,
      stderr: stderrCapture.stream,
      env: {},
      cwd: process.cwd(),
    },
  );

  assert.equal(code, 0);
  const parsed = JSON.parse(stdoutCapture.getOutput()) as {
    contentStartLine?: number;
    contentEndLine?: number;
  };
  assert.equal(parsed.contentStartLine, 100);
  assert.equal(parsed.contentEndLine, 200);
});
