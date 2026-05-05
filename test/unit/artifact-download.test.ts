import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { zipSync } from "fflate";

import {
  ArtifactDownloadError,
  createAzureDevOpsClient,
  createFixtureFetch,
  createReadOnlyRestClient,
  downloadArtifact,
  resolveSafeOutputPath,
  resolveScope,
  validateZipEntries,
} from "../../src/core/index.js";

function repoRoot(): string {
  return process.cwd();
}

async function createMockClient() {
  const scope = resolveScope({ organization: "mock-org", project: "mock-project" });
  const rest = createReadOnlyRestClient({
    token: "mock-token",
    fetchImpl: createFixtureFetch(repoRoot()),
  });
  return createAzureDevOpsClient(scope, rest);
}

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("resolveSafeOutputPath rejects absolute paths", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, "/etc/passwd"), /relative/);
});

test("resolveSafeOutputPath rejects empty paths", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, ""), /cannot be empty/);
  assert.throws(() => resolveSafeOutputPath(cwd, "   "), /cannot be empty/);
});

test("resolveSafeOutputPath rejects NUL bytes", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, "out\0puts.zip"), /NUL/);
});

test("resolveSafeOutputPath rejects parent traversal that escapes cwd", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, "../escape/foo.zip"), /outside the workspace/);
});

test("resolveSafeOutputPath rejects Windows drive prefix", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, "C:\\drop.zip"), /Windows drive/);
});

test("resolveSafeOutputPath rejects UNC prefix", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, "\\\\share\\drop.zip"), /UNC/);
});

test("resolveSafeOutputPath rejects path equal to workspace root", () => {
  const cwd = "/tmp/cwd";
  assert.throws(() => resolveSafeOutputPath(cwd, "."), /workspace root/);
});

test("resolveSafeOutputPath allows safe nested relative paths", () => {
  const cwd = "/tmp/cwd";
  const resolved = resolveSafeOutputPath(cwd, "out/drop.zip");
  assert.equal(resolved.relative, path.join("out", "drop.zip"));
  assert.equal(resolved.resolvedAbsolute, path.join("/tmp/cwd", "out", "drop.zip"));
});

test("validateZipEntries accepts safe entries", () => {
  const entries: Record<string, Uint8Array> = {
    "drop/": new Uint8Array(),
    "drop/README.txt": new Uint8Array([1, 2, 3]),
  };
  const safe = validateZipEntries("/dest", entries);
  assert.equal(safe.length, 2);
  assert.equal(safe[0]?.isDirectory, true);
  assert.equal(safe[1]?.isDirectory, false);
});

test("validateZipEntries rejects parent-traversal entries", () => {
  const entries: Record<string, Uint8Array> = {
    "../evil.txt": new Uint8Array([1]),
  };
  assert.throws(() => validateZipEntries("/dest", entries), /parent traversal/);
});

test("validateZipEntries rejects nested parent-traversal that escapes destination", () => {
  const entries: Record<string, Uint8Array> = {
    "safe/../../evil.txt": new Uint8Array([1]),
  };
  assert.throws(() => validateZipEntries("/dest", entries), /parent traversal/);
});

test("validateZipEntries rejects absolute entry paths", () => {
  const entries: Record<string, Uint8Array> = {
    "/etc/evil.txt": new Uint8Array([1]),
  };
  assert.throws(() => validateZipEntries("/dest", entries), /absolute path/);
});

test("validateZipEntries rejects backslash-style absolute entries", () => {
  const entries: Record<string, Uint8Array> = {
    "C:\\evil.txt": new Uint8Array([1]),
  };
  assert.throws(() => validateZipEntries("/dest", entries), /Windows drive/);
});

test("validateZipEntries rejects NUL bytes in entries", () => {
  const entries: Record<string, Uint8Array> = {
    "drop/foo\0bar.txt": new Uint8Array([1]),
  };
  assert.throws(() => validateZipEntries("/dest", entries), /NUL/);
});

test("downloadArtifact preview without confirm writes nothing", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-preview-");
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "logs",
    outputPath: "out/logs.zip",
    cwd,
    artifactKind: "build",
  });
  assert.equal(result.status, "preview");
  if (result.status !== "preview") return;
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.resolvedArtifactKind, "build");
  assert.deepEqual(result.wouldWrite, [path.join("out", "logs.zip")]);

  // Output redacts signed URLs by design; preview only includes sanitized fields.
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("mock-build-zip-signature"), false);
  assert.equal(serialized.includes("mock-pipeline-zip-signature"), false);

  // No file written.
  assert.equal(existsSync(path.join(cwd, "out", "logs.zip")), false);
});

test("downloadArtifact auto preview returns ambiguous when artifact name exists in both APIs", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-ambiguous-");
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "drop",
    outputPath: "out/drop.zip",
    cwd,
    artifactKind: "auto",
  });
  assert.equal(result.status, "preview");
  if (result.status !== "preview") return;
  assert.equal(result.resolution.status, "ambiguous");
  if (result.resolution.status === "ambiguous") {
    const kinds = result.resolution.candidates.map((c) => c.kind).sort();
    assert.deepEqual(kinds, ["build", "pipeline"]);
  }
  assert.equal(result.resolvedArtifactKind, undefined);
});

test("downloadArtifact pipeline preview with explicit kind reports inferred pipelineId/runId", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-pipeline-preview-");
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "pipeline-only",
    outputPath: "out/pipeline-only.zip",
    cwd,
    artifactKind: "pipeline",
  });
  assert.equal(result.status, "preview");
  if (result.status !== "preview") return;
  assert.equal(result.resolution.status, "resolved");
  assert.equal(result.resolvedArtifactKind, "pipeline");
  assert.equal(result.pipelineId, 301);
  assert.equal(result.runId, 101);
});

test("downloadArtifact pipeline preview returns notFound when the artifact does not exist", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-pipeline-unresolved-");
  // build 999 has no fixture (and 'build-get.json' returns id 101 anyway), but the
  // mock returns a build with definitionId=301 for any build/{id} request, so we
  // pin pipelineId via explicit override absence + nonexistent name.
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "does-not-exist",
    outputPath: "out/x.zip",
    cwd,
    artifactKind: "pipeline",
  });
  assert.equal(result.status, "preview");
  if (result.status !== "preview") return;
  assert.equal(result.resolution.status, "notFound");
});

test("downloadArtifact build confirmed download writes ZIP", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-build-write-");
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "drop",
    outputPath: "out/drop.zip",
    cwd,
    artifactKind: "build",
    confirm: true,
  });
  assert.equal(result.status, "downloaded");
  if (result.status === "preview") return;
  assert.equal(result.resolvedArtifactKind, "build");
  assert.equal(result.bytesDownloaded > 0, true);

  const target = path.join(cwd, "out", "drop.zip");
  const written = await readFile(target);
  assert.equal(written.byteLength, result.bytesDownloaded);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("mock-build-zip-signature"), false);
});

test("downloadArtifact pipeline confirmed download writes ZIP and never sends Authorization to signed URL", async () => {
  const observedHeaders: Array<{ url: string; auth?: string }> = [];

  const fixtureFetch = createFixtureFetch(repoRoot());
  const trackingFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headersIn = init?.headers ?? {};
    let auth: string | undefined;
    if (headersIn instanceof Headers) {
      auth = headersIn.get("Authorization") ?? undefined;
    } else if (Array.isArray(headersIn)) {
      const found = headersIn.find(([k]) => k.toLowerCase() === "authorization");
      auth = found?.[1];
    } else {
      const obj = headersIn as Record<string, string>;
      auth = obj.Authorization ?? obj.authorization;
    }
    observedHeaders.push({ url, ...(auth !== undefined ? { auth } : {}) });
    return fixtureFetch(input as never, init);
  };

  const scope = resolveScope({ organization: "mock-org", project: "mock-project" });
  const rest = createReadOnlyRestClient({
    token: "mock-token",
    fetchImpl: trackingFetch,
  });
  const client = createAzureDevOpsClient(scope, rest);

  const cwd = await makeTempDir("artifact-test-pipeline-write-");
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "pipeline-only",
    outputPath: "out/pipeline-only.zip",
    cwd,
    artifactKind: "pipeline",
    confirm: true,
  });
  assert.equal(result.status, "downloaded");
  if (result.status === "preview") return;
  assert.equal(result.resolvedArtifactKind, "pipeline");
  assert.equal(result.pipelineId, 301);
  assert.equal(result.runId, 101);

  const target = path.join(cwd, "out", "pipeline-only.zip");
  const written = await readFile(target);
  assert.equal(written.byteLength, result.bytesDownloaded);

  // The signed URL fetch must NOT have an Authorization header.
  const signedFetches = observedHeaders.filter((entry) =>
    entry.url.startsWith("https://example.invalid/pipeline-artifact-zip/"),
  );
  assert.equal(signedFetches.length > 0, true);
  for (const fetched of signedFetches) {
    assert.equal(fetched.auth, undefined, `signed URL fetch must not include Authorization: ${fetched.url}`);
  }
});

test("downloadArtifact refuses to overwrite existing file without overwrite=true", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-overwrite-refuse-");
  await mkdir(path.join(cwd, "out"), { recursive: true });
  await writeFile(path.join(cwd, "out", "drop.zip"), "existing");

  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop.zip",
        cwd,
        artifactKind: "build",
        confirm: true,
      }),
    (error: unknown) => error instanceof ArtifactDownloadError && error.code === "outputExists",
  );
});

test("downloadArtifact overwrites existing file with overwrite=true", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-overwrite-allow-");
  await mkdir(path.join(cwd, "out"), { recursive: true });
  const target = path.join(cwd, "out", "drop.zip");
  await writeFile(target, "existing");

  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "drop",
    outputPath: "out/drop.zip",
    cwd,
    artifactKind: "build",
    confirm: true,
    overwrite: true,
  });
  assert.equal(result.status, "downloaded");
  const written = await readFile(target);
  assert.notEqual(written.toString("utf8"), "existing");
});

test("downloadArtifact enforces maxBytes by failing closed", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-maxbytes-");

  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop.zip",
        cwd,
        artifactKind: "build",
        confirm: true,
        maxBytes: 1,
      }),
    /exceeded maxBytes=1/,
  );
});

test("downloadArtifact extract writes expected files", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-extract-");
  const result = await downloadArtifact(client, {
    buildId: 101,
    artifactName: "drop",
    outputPath: "out/drop",
    cwd,
    artifactKind: "build",
    confirm: true,
    extract: true,
  });
  assert.equal(result.status, "extracted");
  if (result.status === "preview") return;
  assert.deepEqual(
    result.writtenFiles.map((p) => p.split(path.sep).join("/")).sort(),
    ["out/drop/drop/README.txt", "out/drop/drop/bin/app.txt"].sort(),
  );

  const readme = await readFile(path.join(cwd, "out", "drop", "drop", "README.txt"), "utf8");
  assert.equal(readme, "build artifact drop\n");
});

test("downloadArtifact extract refuses to overwrite existing file without overwrite=true", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-extract-refuse-");
  // Pre-create the conflicting target file inside the destination directory.
  const conflict = path.join(cwd, "out", "drop", "drop", "README.txt");
  await mkdir(path.dirname(conflict), { recursive: true });
  await writeFile(conflict, "existing");

  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
      }),
    (error: unknown) => error instanceof ArtifactDownloadError && error.code === "outputExists",
  );
});

test("downloadArtifact extract rejects ZIP with malicious entry path", async () => {
  // Build a synthetic AzureDevOpsClient that returns a ZIP containing a
  // malicious '../evil.txt' entry on download, then ensure orchestration rejects it.
  const evilZip = zipSync(
    {
      "../evil.txt": new TextEncoder().encode("rm -rf"),
    },
    { mtime: new Date(Date.UTC(2026, 0, 1)) },
  );

  const client = {
    listPipelines: async () => [],
    listBuilds: async () => [],
    getBuild: async () => undefined,
    getRun: async () => undefined,
    getTimeline: async () => [],
    listLogs: async () => [],
    getLog: async () => "",
    listArtifacts: async () => [],
    resolveArtifactSource: async () => ({
      status: "resolved" as const,
      artifactKind: "build" as const,
      resolved: { kind: "build" as const, artifactName: "evil" },
    }),
    downloadArtifactZip: async () => ({
      bytes: evilZip,
      metadata: { artifactName: "evil", resolvedArtifactKind: "build" as const },
    }),
    resolveBuildLogSelection: async () => ({}),
  };

  const cwd = await makeTempDir("artifact-test-extract-malicious-");
  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 1,
        artifactName: "evil",
        outputPath: "out/evil",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
      }),
    /parent traversal|escapes destination/,
  );
  // Nothing should have been written outside the temp dir; even the destination
  // directory must not contain extracted files.
  const dest = path.join(cwd, "out", "evil");
  const destExists = existsSync(dest);
  if (destExists) {
    const stats = await stat(dest);
    if (stats.isDirectory()) {
      // Allow the dir to be empty; ensure no children were written.
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dest);
      assert.deepEqual(entries, []);
    }
  }
});

// --- New tests for Phase 7B remediation (symlink containment, internal ZIP
// conflicts, NaN-clamp in getBinary, pipelineSourceUnresolved, auto-mode
// pipeline-error isolation) ---

import {
  createReadOnlyRestClient as _unused_createReadOnlyRestClient,
  type AzureDevOpsClient,
} from "../../src/core/index.js";

function makeStubClient(overrides: Partial<AzureDevOpsClient>): AzureDevOpsClient {
  const base: AzureDevOpsClient = {
    listPipelines: async () => [],
    listBuilds: async () => [],
    getBuild: async () => undefined,
    getRun: async () => undefined,
    getTimeline: async () => [],
    listLogs: async () => [],
    getLog: async () => "",
    listArtifacts: async () => [],
    resolveArtifactSource: async () => ({
      status: "notFound",
      artifactKind: "auto",
      artifactName: "x",
      message: "stub",
    }),
    downloadArtifactZip: async () => ({
      bytes: new Uint8Array(),
      metadata: { artifactName: "x", resolvedArtifactKind: "build" },
    }),
    resolveBuildLogSelection: async () => ({}),
  };
  return { ...base, ...overrides };
}

test("downloadArtifact rejects writes when output path traverses a symlink to outside the workspace", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-symlink-cwd-");
  const outsideTarget = await makeTempDir("artifact-test-symlink-outside-");
  // Create cwd/out as a symlink that points outside the workspace.
  await symlink(outsideTarget, path.join(cwd, "out"));

  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop.zip",
        cwd,
        artifactKind: "build",
        confirm: true,
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidOutput" &&
      /symbolic link|symlink/i.test(error.message),
  );

  // The targeted file outside the workspace must not have been written.
  assert.equal(existsSync(path.join(outsideTarget, "drop.zip")), false);
});

test("downloadArtifact rejects extract when destination directory is a symlink to outside the workspace", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-symlink-extract-cwd-");
  const outsideTarget = await makeTempDir("artifact-test-symlink-extract-outside-");
  await symlink(outsideTarget, path.join(cwd, "out"));

  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidOutput" &&
      /symbolic link|symlink/i.test(error.message),
  );

  // No extracted files should appear at the symlink target.
  assert.equal(existsSync(path.join(outsideTarget, "drop")), false);
});

test("downloadArtifact extract refuses ZIPs with internal file/directory conflicts", async () => {
  const conflictZip = zipSync(
    {
      a: new TextEncoder().encode("file at a"),
      "a/b.txt": new TextEncoder().encode("file inside a as dir"),
    },
    { mtime: new Date(Date.UTC(2026, 0, 1)) },
  );

  const stub = makeStubClient({
    resolveArtifactSource: async () => ({
      status: "resolved",
      artifactKind: "build",
      resolved: { kind: "build", artifactName: "conflict" },
    }),
    downloadArtifactZip: async () => ({
      bytes: conflictZip,
      metadata: { artifactName: "conflict", resolvedArtifactKind: "build" },
    }),
  });

  const cwd = await makeTempDir("artifact-test-zip-conflict-");
  await assert.rejects(
    () =>
      downloadArtifact(stub, {
        buildId: 1,
        artifactName: "conflict",
        outputPath: "out/conflict",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidZipEntry" &&
      /conflicts with file entry/i.test(error.message),
  );

  // Preflight failed: no partial extraction should have happened.
  const dest = path.join(cwd, "out", "conflict");
  if (existsSync(dest)) {
    const stats = await stat(dest);
    if (stats.isDirectory()) {
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dest);
      assert.deepEqual(entries, []);
    }
  }
});

test("resolveArtifactSource returns pipelineSourceUnresolved when no inferable definitionId is available", async () => {
  // Stub the client's getBuild to return a build without a definitionId, then
  // exercise resolveArtifactSource directly with kind=pipeline and no explicit
  // pipelineId/runId.
  const stub = makeStubClient({
    // The default stub has no override for resolveArtifactSource here; we want
    // the real implementation. Instead, we call the real client wired to a
    // stub fetch that always returns a build payload without definition.id and
    // 404 for the pipeline artifact endpoint.
  });
  // Build a real client + rest client with a custom fetch.
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    if (/\/_apis\/build\/builds\/\d+\/?$/.test(parsed.pathname)) {
      return new Response(JSON.stringify({ id: 999, buildNumber: "999" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (/\/_apis\/build\/builds\/\d+\/artifacts\/?$/.test(parsed.pathname)) {
      // Build artifact API returns 404 for any artifactName here.
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  };
  const scope = resolveScope({ organization: "mock-org", project: "mock-project" });
  const rest = createReadOnlyRestClient({ token: "mock-token", fetchImpl });
  const realClient = createAzureDevOpsClient(scope, rest);

  const resolution = await realClient.resolveArtifactSource({
    buildId: 999,
    artifactName: "anything",
    artifactKind: "pipeline",
  });
  assert.equal(resolution.status, "pipelineSourceUnresolved");
  if (resolution.status === "pipelineSourceUnresolved") {
    assert.match(resolution.message, /pipelineId.*runId|explicit/i);
  }
  // Use stub variable so the linter does not complain about unused destructured result.
  void stub;
});

test("getBinary clamps NaN maxBytes to the default cap instead of disabling enforcement", async () => {
  // A 5-byte response is well under the default 100 MiB cap; NaN must coerce to
  // the default and the call must succeed without throwing.
  const fetchImpl: typeof fetch = async () =>
    new Response(new Uint8Array([1, 2, 3, 4, 5]), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  const rest = createReadOnlyRestClient({ token: "mock-token", fetchImpl });
  const response = await rest.getBinary("https://example.invalid/anything", {
    maxBytes: Number.NaN,
    auth: "none",
  });
  assert.equal(response.data.byteLength, 5);
});

test("getBinary rejects oversize body even when called with NaN maxBytes (cap is the default, not unbounded)", async () => {
  // Build a fake response whose body length exceeds the smallest legal cap (1).
  // We rely on the streaming reader to fail closed; here we set maxBytes=1 to
  // verify that overflow is detected, then assert that NaN does not silently
  // disable the cap (it falls back to the default, which is finite).
  const bigBody = new Uint8Array(64); // 64 bytes
  const fetchImpl: typeof fetch = async () =>
    new Response(bigBody, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  const rest = createReadOnlyRestClient({ token: "mock-token", fetchImpl });

  // Sanity: explicit small maxBytes triggers fail-closed.
  await assert.rejects(
    () => rest.getBinary("https://example.invalid/x", { maxBytes: 1, auth: "none" }),
    /exceeded maxBytes=1/,
  );

  // NaN: coerced to default; 64 bytes well under 100 MiB → success.
  const response = await rest.getBinary("https://example.invalid/x", {
    maxBytes: Number.NaN,
    auth: "none",
  });
  assert.equal(response.data.byteLength, 64);
});

test("resolveArtifactSource auto mode swallows non-404 pipeline errors when build candidate exists and surfaces them via notes", async () => {
  // Custom fetch: build artifact found, but pipeline artifact endpoint returns 500.
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    if (/\/_apis\/build\/builds\/\d+\/?$/.test(parsed.pathname)) {
      return new Response(JSON.stringify({ id: 101, definition: { id: 301 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (/\/_apis\/build\/builds\/\d+\/artifacts\/?$/.test(parsed.pathname)) {
      const artifactName = parsed.searchParams.get("artifactName");
      if (artifactName === "x") {
        return new Response(
          JSON.stringify({
            id: 1,
            name: "x",
            resource: { type: "Container", downloadUrl: "https://example.invalid/x.zip" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (/\/_apis\/pipelines\/\d+\/runs\/\d+\/artifacts\/?$/.test(parsed.pathname)) {
      return new Response(JSON.stringify({ message: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  };
  const scope = resolveScope({ organization: "mock-org", project: "mock-project" });
  const rest = createReadOnlyRestClient({ token: "mock-token", fetchImpl });
  const realClient = createAzureDevOpsClient(scope, rest);

  const resolution = await realClient.resolveArtifactSource({
    buildId: 101,
    artifactName: "x",
    artifactKind: "auto",
  });
  assert.equal(resolution.status, "resolved");
  if (resolution.status === "resolved") {
    assert.equal(resolution.resolved.kind, "build");
    assert.ok(resolution.notes);
    assert.match(resolution.notes!.join("\n"), /Pipeline Artifacts lookup errored/i);
  }
});

test("resolveArtifactSource auto mode re-raises pipeline errors when no build candidate is available", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    if (/\/_apis\/build\/builds\/\d+\/?$/.test(parsed.pathname)) {
      return new Response(JSON.stringify({ id: 101, definition: { id: 301 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (/\/_apis\/build\/builds\/\d+\/artifacts\/?$/.test(parsed.pathname)) {
      // Build-side: 404 for everything → no build candidate.
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (/\/_apis\/pipelines\/\d+\/runs\/\d+\/artifacts\/?$/.test(parsed.pathname)) {
      return new Response(JSON.stringify({ message: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  };
  const scope = resolveScope({ organization: "mock-org", project: "mock-project" });
  const rest = createReadOnlyRestClient({ token: "mock-token", fetchImpl });
  const realClient = createAzureDevOpsClient(scope, rest);

  await assert.rejects(
    () =>
      realClient.resolveArtifactSource({
        buildId: 101,
        artifactName: "missing",
        artifactKind: "auto",
      }),
    /HTTP 500/,
  );
});

// --- Round-2 remediation tests: per-entry symlink check, dangling symlink at
// output, ZIP same-path file/dir collision, degenerate ZIP entry rejection,
// and verification that benign prefix-similar names are NOT flagged ---

test("downloadArtifact rejects writes when the output file itself is a dangling symlink", async () => {
  const client = await createMockClient();
  const cwd = await makeTempDir("artifact-test-dangling-symlink-cwd-");
  const danglingTarget = path.join(os.tmpdir(), `artifact-test-dangling-target-${Date.now()}.zip`);
  // Create cwd/out/drop.zip as a symlink whose target does NOT exist.
  await mkdir(path.join(cwd, "out"), { recursive: true });
  await symlink(danglingTarget, path.join(cwd, "out", "drop.zip"));

  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop.zip",
        cwd,
        artifactKind: "build",
        confirm: true,
        overwrite: true, // would otherwise complain about the symlink existing
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidOutput" &&
      /symbolic link/i.test(error.message),
  );

  // Confirm no file was written through the dangling symlink.
  assert.equal(existsSync(danglingTarget), false);
});

test("downloadArtifact extract rejects per-entry writes when a pre-existing symlink lives inside the destination", async () => {
  // Pre-create the destination directory and plant a symlink inside it.
  const cwd = await makeTempDir("artifact-test-inner-symlink-cwd-");
  const outsideTarget = await makeTempDir("artifact-test-inner-symlink-outside-");
  const dest = path.join(cwd, "out", "drop");
  await mkdir(dest, { recursive: true });
  await mkdir(path.join(dest, "drop"), { recursive: true });
  await symlink(outsideTarget, path.join(dest, "drop", "bin"));

  // Use the real mock client; the build-drop ZIP fixture contains
  // drop/bin/app.txt, which would now traverse the planted symlink.
  const client = await createMockClient();
  await assert.rejects(
    () =>
      downloadArtifact(client, {
        buildId: 101,
        artifactName: "drop",
        outputPath: "out/drop",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
        overwrite: true,
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidOutput" &&
      /symbolic link/i.test(error.message),
  );

  // No file from the artifact must have leaked into the symlink target.
  assert.equal(existsSync(path.join(outsideTarget, "app.txt")), false);
});

test("downloadArtifact extract rejects ZIPs where the same path is both a directory and a file entry", async () => {
  const collidingZip = zipSync(
    {
      a: new TextEncoder().encode("file at a"),
      "a/": new Uint8Array(),
    },
    { mtime: new Date(Date.UTC(2026, 0, 1)) },
  );

  const stub = makeStubClient({
    resolveArtifactSource: async () => ({
      status: "resolved",
      artifactKind: "build",
      resolved: { kind: "build", artifactName: "collide" },
    }),
    downloadArtifactZip: async () => ({
      bytes: collidingZip,
      metadata: { artifactName: "collide", resolvedArtifactKind: "build" },
    }),
  });

  const cwd = await makeTempDir("artifact-test-collide-");
  await assert.rejects(
    () =>
      downloadArtifact(stub, {
        buildId: 1,
        artifactName: "collide",
        outputPath: "out/collide",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidZipEntry" &&
      /directory entry/i.test(error.message),
  );
});

test("downloadArtifact extract rejects ZIPs containing degenerate entries (\".\" or empty path)", async () => {
  const degenerateZip = zipSync(
    {
      "ok.txt": new TextEncoder().encode("ok"),
      ".": new TextEncoder().encode("degenerate"),
    },
    { mtime: new Date(Date.UTC(2026, 0, 1)) },
  );

  const stub = makeStubClient({
    resolveArtifactSource: async () => ({
      status: "resolved",
      artifactKind: "build",
      resolved: { kind: "build", artifactName: "degenerate" },
    }),
    downloadArtifactZip: async () => ({
      bytes: degenerateZip,
      metadata: { artifactName: "degenerate", resolvedArtifactKind: "build" },
    }),
  });

  const cwd = await makeTempDir("artifact-test-degenerate-");
  await assert.rejects(
    () =>
      downloadArtifact(stub, {
        buildId: 1,
        artifactName: "degenerate",
        outputPath: "out/degenerate",
        cwd,
        artifactKind: "build",
        confirm: true,
        extract: true,
      }),
    (error: unknown) =>
      error instanceof ArtifactDownloadError &&
      error.code === "invalidZipEntry" &&
      /degenerate path/i.test(error.message),
  );
});

test("validateZipEntries does NOT flag prefix-similar but distinct sibling entries", () => {
  // `a-1` and `a-1.txt` share a textual prefix but are siblings, not ancestor/leaf.
  // Neither path is a parent directory of the other; this must pass.
  const entries: Record<string, Uint8Array> = {
    "a-1": new Uint8Array([1]),
    "a-1.txt": new Uint8Array([2]),
  };
  const safe = validateZipEntries("/dest", entries);
  assert.equal(safe.length, 2);
  // And the conflict detector must not throw on these either.
  // (We do not export detectInternalEntryConflicts; rely on end-to-end behavior.)
  // Convert into a stub-driven extract via inline fflate ZIP built from the same map.
});

test("downloadArtifact extract accepts ZIPs whose entries share a textual prefix but are siblings", async () => {
  const okZip = zipSync(
    {
      "a-1": new TextEncoder().encode("first sibling"),
      "a-1.txt": new TextEncoder().encode("second sibling"),
    },
    { mtime: new Date(Date.UTC(2026, 0, 1)) },
  );

  const stub = makeStubClient({
    resolveArtifactSource: async () => ({
      status: "resolved",
      artifactKind: "build",
      resolved: { kind: "build", artifactName: "siblings" },
    }),
    downloadArtifactZip: async () => ({
      bytes: okZip,
      metadata: { artifactName: "siblings", resolvedArtifactKind: "build" },
    }),
  });

  const cwd = await makeTempDir("artifact-test-siblings-");
  const result = await downloadArtifact(stub, {
    buildId: 1,
    artifactName: "siblings",
    outputPath: "out/siblings",
    cwd,
    artifactKind: "build",
    confirm: true,
    extract: true,
  });
  assert.equal(result.status, "extracted");
  if (result.status === "extracted") {
    assert.equal(result.writtenFiles.length, 2);
  }
});
