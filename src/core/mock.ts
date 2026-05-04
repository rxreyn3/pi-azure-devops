import { readFile } from "node:fs/promises";
import path from "node:path";

interface FixtureMapEntry {
  file: string;
  contentType: string;
}

function resolveFixture(pathname: string): FixtureMapEntry | undefined {
  if (/\/_apis\/pipelines(?:\?|$)/.test(pathname) && !/\/runs\//.test(pathname)) {
    return { file: "pipelines-list.json", contentType: "application/json" };
  }
  if (/\/_apis\/build\/builds(?:\?|$)/.test(pathname)) {
    return { file: "builds-list.json", contentType: "application/json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/?$/.test(pathname)) {
    return { file: "build-get.json", contentType: "application/json" };
  }
  if (/\/_apis\/pipelines\/\d+\/runs\/\d+\/?$/.test(pathname)) {
    return { file: "run-get.json", contentType: "application/json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/timeline\/?$/.test(pathname)) {
    return { file: "timeline-get.json", contentType: "application/json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/logs\/?$/.test(pathname)) {
    return { file: "logs-list.json", contentType: "application/json" };
  }
  if (/\/_apis\/build\/builds\/\d+\/logs\/\d+\/?$/.test(pathname)) {
    return { file: "log-get.txt", contentType: "text/plain" };
  }
  if (/\/_apis\/build\/builds\/\d+\/artifacts\/?$/.test(pathname)) {
    return { file: "artifacts-list.json", contentType: "application/json" };
  }
  return undefined;
}

export function createFixtureFetch(repoRoot = process.cwd()): typeof fetch {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    const fixture = resolveFixture(pathname);
    if (!fixture) {
      return new Response(`No fixture for ${pathname}`, { status: 404, headers: { "content-type": "text/plain" } });
    }

    const fullPath = path.join(repoRoot, "test", "fixtures", fixture.file);
    const body = await readFile(fullPath, "utf8");

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": fixture.contentType,
      },
    });
  };
}
