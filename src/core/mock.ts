import { readFile } from "node:fs/promises";
import path from "node:path";

interface JsonInlineResolution {
  kind: "json";
  body: unknown;
}

interface NotFoundResolution {
  kind: "notFound";
  message: string;
}

interface JsonFileResolution {
  kind: "jsonFile";
  file: string;
}

interface TextFileResolution {
  kind: "textFile";
  file: string;
  contentType: string;
}

interface ZipBase64FileResolution {
  kind: "zipBase64File";
  file: string;
}

type FixtureResolution =
  | JsonInlineResolution
  | NotFoundResolution
  | JsonFileResolution
  | TextFileResolution
  | ZipBase64FileResolution;

/**
 * Build ID that the mock fetch routes to the timeline-name-selectors fixture.
 * Used by Phase 7A selector tests that need duplicate names / ambiguity coverage.
 * Any other build ID gets the default `timeline-get.json` fixture.
 */
export const SELECTOR_FIXTURE_BUILD_ID = 202;

const MOCK_BUILD_DROP_ZIP_URL =
  "https://example.invalid/artifact-zip/build-drop?sig=mock-build-zip-signature";
const MOCK_BUILD_LOGS_ZIP_URL =
  "https://example.invalid/artifact-zip/build-logs?sig=mock-build-zip-signature";
const MOCK_PIPELINE_DROP_ZIP_URL =
  "https://example.invalid/pipeline-artifact-zip/drop?sig=mock-pipeline-zip-signature";
const MOCK_PIPELINE_ONLY_ZIP_URL =
  "https://example.invalid/pipeline-artifact-zip/pipeline-only?sig=mock-pipeline-zip-signature";
const MOCK_PIPELINE_SIGNED_EXPIRY = "2026-12-31T23:59:59Z";

/**
 * Build artifacts the mock recognizes for the
 * `getBuildArtifact(buildId, artifactName)` endpoint.
 */
const MOCK_BUILD_ARTIFACT_REGISTRY: Record<
  string,
  { id: number; resourceType: string; downloadUrl: string }
> = {
  drop: { id: 1, resourceType: "Container", downloadUrl: MOCK_BUILD_DROP_ZIP_URL },
  logs: { id: 2, resourceType: "FilePath", downloadUrl: MOCK_BUILD_LOGS_ZIP_URL },
};

/**
 * Pipeline artifacts the mock recognizes for the
 * `getPipelineArtifact(pipelineId, runId, artifactName)` endpoint.
 */
const MOCK_PIPELINE_ARTIFACT_REGISTRY: Record<string, { signedUrl: string }> = {
  drop: { signedUrl: MOCK_PIPELINE_DROP_ZIP_URL },
  "pipeline-only": { signedUrl: MOCK_PIPELINE_ONLY_ZIP_URL },
};

/**
 * Binary fixtures keyed by external download host + path. Values are base64 fixture filenames.
 */
const MOCK_BINARY_REGISTRY: Record<string, string> = {
  "example.invalid/artifact-zip/build-drop": "artifact-build-drop.zip.b64",
  "example.invalid/artifact-zip/build-logs": "artifact-build-drop.zip.b64",
  "example.invalid/pipeline-artifact-zip/drop": "artifact-pipeline-drop.zip.b64",
  "example.invalid/pipeline-artifact-zip/pipeline-only": "artifact-pipeline-drop.zip.b64",
};

function resolveFixture(parsed: URL): FixtureResolution | undefined {
  const pathname = parsed.pathname;
  const search = parsed.searchParams;
  const host = parsed.host.toLowerCase();

  // External binary endpoints (signed-content URLs and build artifact zip URLs).
  const hostKey = `${host}${pathname}`;
  const binaryFixture = MOCK_BINARY_REGISTRY[hostKey];
  if (binaryFixture) {
    return { kind: "zipBase64File", file: binaryFixture };
  }

  // Build artifacts: with artifactName query → single artifact JSON; without → list.
  if (/\/_apis\/build\/builds\/\d+\/artifacts\/?$/.test(pathname)) {
    const artifactName = search.get("artifactName");
    if (artifactName === null) {
      return { kind: "jsonFile", file: "artifacts-list.json" };
    }
    const buildArtifact = MOCK_BUILD_ARTIFACT_REGISTRY[artifactName];
    if (!buildArtifact) {
      return { kind: "notFound", message: `Mock build artifact "${artifactName}" not found.` };
    }
    return {
      kind: "json",
      body: {
        id: buildArtifact.id,
        name: artifactName,
        resource: {
          type: buildArtifact.resourceType,
          downloadUrl: buildArtifact.downloadUrl,
        },
      },
    };
  }

  // Pipeline artifacts: only Get is documented.
  if (/\/_apis\/pipelines\/\d+\/runs\/\d+\/artifacts\/?$/.test(pathname)) {
    const artifactName = search.get("artifactName");
    if (artifactName === null) {
      return {
        kind: "notFound",
        message: "Mock pipelines artifacts endpoint requires artifactName query parameter.",
      };
    }
    const pipelineArtifact = MOCK_PIPELINE_ARTIFACT_REGISTRY[artifactName];
    if (!pipelineArtifact) {
      return { kind: "notFound", message: `Mock pipeline artifact "${artifactName}" not found.` };
    }
    const expand = search.get("$expand");
    const body: {
      name: string;
      source: string;
      signedContent?: { url: string; signedExpiry: string };
    } = { name: artifactName, source: "mock-pipeline-source" };
    if (expand === "signedContent") {
      body.signedContent = {
        url: pipelineArtifact.signedUrl,
        signedExpiry: MOCK_PIPELINE_SIGNED_EXPIRY,
      };
    }
    return { kind: "json", body };
  }

  // Existing read-only fixtures (preserve previous behavior).
  if (/\/_apis\/pipelines(?:\?|$)/.test(pathname) && !/\/runs\//.test(pathname)) {
    return { kind: "jsonFile", file: "pipelines-list.json" };
  }
  if (/\/_apis\/build\/builds(?:\?|$)/.test(pathname)) {
    return { kind: "jsonFile", file: "builds-list.json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/?$/.test(pathname)) {
    return { kind: "jsonFile", file: "build-get.json" };
  }
  if (/\/_apis\/pipelines\/\d+\/runs\/\d+\/?$/.test(pathname)) {
    return { kind: "jsonFile", file: "run-get.json" };
  }
  const timelineMatch = pathname.match(/\/_apis\/build\/builds\/(\d+)\/timeline\/?$/);
  if (timelineMatch) {
    const buildId = Number(timelineMatch[1]);
    if (buildId === SELECTOR_FIXTURE_BUILD_ID) {
      return { kind: "jsonFile", file: "timeline-name-selectors.json" };
    }
    return { kind: "jsonFile", file: "timeline-get.json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/logs\/?$/.test(pathname)) {
    return { kind: "jsonFile", file: "logs-list.json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/logs\/\d+\/?$/.test(pathname)) {
    return { kind: "textFile", file: "log-get.txt", contentType: "text/plain" };
  }

  return undefined;
}

export function createFixtureFetch(repoRoot = process.cwd()): typeof fetch {
  return async (input: string | URL | Request): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);

    const fixture = resolveFixture(parsed);
    if (!fixture) {
      return new Response(`No fixture for ${parsed.host}${parsed.pathname}`, {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    }

    if (fixture.kind === "notFound") {
      return new Response(JSON.stringify({ message: fixture.message }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    if (fixture.kind === "json") {
      return new Response(JSON.stringify(fixture.body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (fixture.kind === "jsonFile") {
      const fullPath = path.join(repoRoot, "test", "fixtures", fixture.file);
      const body = await readFile(fullPath, "utf8");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (fixture.kind === "textFile") {
      const fullPath = path.join(repoRoot, "test", "fixtures", fixture.file);
      const body = await readFile(fullPath, "utf8");
      return new Response(body, {
        status: 200,
        headers: { "content-type": fixture.contentType },
      });
    }

    // zipBase64File: decode base64 file into binary bytes for the body.
    const fullPath = path.join(repoRoot, "test", "fixtures", fixture.file);
    const base64 = (await readFile(fullPath, "utf8")).trim();
    const bytes = Buffer.from(base64, "base64");
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  };
}
