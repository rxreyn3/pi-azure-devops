#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectBuildFailureDiagnostics,
  createAzureDevOpsClient,
  createFixtureFetch,
  createReadOnlyRestClient,
  getAuthSensitiveValues,
  redactDiagnosticsBundle,
  redactSensitiveText,
  resolveAzureDevOpsConfig,
  resolveScope,
  resolveTokenFromEnv,
  summarizeTimelineRecords,
} from "../core/index.js";
import { parsePositiveIntegerStrict } from "../core/parsing.js";

interface CliContext {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const commandParts: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (!token.startsWith("--")) {
      commandParts.push(token);
      continue;
    }

    if (token === "--json" || token === "--mock") {
      flags[token.slice(2)] = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    flags[token.slice(2)] = next;
    i += 1;
  }

  return {
    command: commandParts.join(" "),
    flags,
  };
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  if (typeof value === "string") return value;
  return undefined;
}

function flagNumber(flags: Record<string, string | boolean>, key: string): number | undefined {
  const value = flagString(flags, key);
  if (!value) return undefined;
  return parsePositiveIntegerStrict(value, `--${key}`);
}

function isJson(flags: Record<string, string | boolean>): boolean {
  return Boolean(flags.json);
}

function isMock(flags: Record<string, string | boolean>): boolean {
  return Boolean(flags.mock);
}

function writeOutput(context: CliContext, asJson: boolean, payload: unknown): void {
  if (asJson) {
    context.stdout.write(`${redactSensitiveText(JSON.stringify(payload, null, 2))}\n`);
    return;
  }

  if (typeof payload === "string") {
    context.stdout.write(`${redactSensitiveText(payload)}\n`);
    return;
  }

  context.stdout.write(`${redactSensitiveText(JSON.stringify(payload, null, 2))}\n`);
}

function repoRootFromCliFile(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const candidate = path.resolve(path.dirname(thisFile), "..", "..");
  return path.basename(candidate) === "dist" ? path.dirname(candidate) : candidate;
}

async function createClientFromFlags(flags: Record<string, string | boolean>, context: CliContext) {
  const mock = isMock(flags);
  const explicitOrganization = flagString(flags, "organization");
  const explicitProject = flagString(flags, "project");
  const explicitProfile = flagString(flags, "profile");

  const config = await resolveAzureDevOpsConfig({
    ...(explicitOrganization !== undefined ? { organization: explicitOrganization } : {}),
    ...(explicitProject !== undefined ? { project: explicitProject } : {}),
    ...(explicitProfile !== undefined ? { profile: explicitProfile } : {}),
    env: context.env,
    cwd: context.cwd,
  });

  if (mock) {
    const scope = resolveScope({ organization: config.organization ?? "mock-org", project: config.project ?? "mock-project" });
    const rest = createReadOnlyRestClient({
      token: "mock-token",
      fetchImpl: createFixtureFetch(repoRootFromCliFile()),
    });
    return { client: createAzureDevOpsClient(scope, rest), config, tokenSource: "mock", mock: true };
  }

  const token = resolveTokenFromEnv(context.env);
  if (!token) {
    throw new Error(
      "Missing token. Set PI_AZURE_DEVOPS_PAT, PI_ADO_PAT, AZURE_DEVOPS_PAT, AZURE_DEVOPS_EXT_PAT, ADO_PAT, or SYSTEM_ACCESSTOKEN.",
    );
  }

  const scope = resolveScope({
    organization: config.organization,
    project: config.project,
  });
  const rest = createReadOnlyRestClient({ token: token.token });

  return {
    client: createAzureDevOpsClient(scope, rest),
    config,
    tokenSource: token.source,
    mock: false,
  };
}

async function runDoctor(flags: Record<string, string | boolean>, context: CliContext): Promise<void> {
  const doctorOrganization = flagString(flags, "organization");
  const doctorProject = flagString(flags, "project");
  const doctorProfile = flagString(flags, "profile");

  const config = await resolveAzureDevOpsConfig({
    ...(doctorOrganization !== undefined ? { organization: doctorOrganization } : {}),
    ...(doctorProject !== undefined ? { project: doctorProject } : {}),
    ...(doctorProfile !== undefined ? { profile: doctorProfile } : {}),
    env: context.env,
    cwd: context.cwd,
  });
  const token = resolveTokenFromEnv(context.env);

  const payload = {
    config: {
      organization: config.organization,
      project: config.project,
      profile: config.profile,
      sources: config.sources,
      configFilesChecked: config.configFilesChecked,
    },
    auth: {
      tokenFound: Boolean(token),
      tokenSource: token?.source,
    },
    warnings: [
      ...config.warnings,
      ...(config.organization ? [] : ["Missing organization (set --organization or env/config)"]),
      ...(config.project ? [] : ["Missing project (set --project or env/config)"]),
      ...(token ? [] : ["Missing token env value"]),
    ],
  };

  writeOutput(context, isJson(flags), payload);
}

async function runStatus(flags: Record<string, string | boolean>, context: CliContext): Promise<void> {
  const buildIdRaw = flagString(flags, "build-id");
  if (!buildIdRaw) {
    throw new Error("status requires --build-id");
  }
  const buildId = parsePositiveIntegerStrict(buildIdRaw, "--build-id");

  const { client } = await createClientFromFlags(flags, context);

  const build = await client.getBuild(buildId);
  const timeline = await client.getTimeline(buildId);
  const timelineSummary = summarizeTimelineRecords(timeline);

  const jobId = flagString(flags, "job-id");
  const taskId = flagString(flags, "task-id");
  const logSelection = await client.resolveBuildLogSelection({
    buildId,
    ...(jobId !== undefined ? { jobId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
  });

  const payload = {
    build,
    timeline: timelineSummary,
    selected: logSelection,
  };

  writeOutput(context, isJson(flags), payload);
}

async function runLogs(flags: Record<string, string | boolean>, context: CliContext): Promise<void> {
  const buildIdRaw = flagString(flags, "build-id");
  if (!buildIdRaw) {
    throw new Error("logs requires --build-id");
  }

  const buildId = parsePositiveIntegerStrict(buildIdRaw, "--build-id");
  const explicitLogId = flagNumber(flags, "log-id");
  const jobId = flagString(flags, "job-id");
  const taskId = flagString(flags, "task-id");

  const { client } = await createClientFromFlags(flags, context);

  const logs = await client.listLogs(buildId);
  const selected = await client.resolveBuildLogSelection({
    buildId,
    ...(jobId !== undefined ? { jobId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    ...(explicitLogId !== undefined ? { explicitLogId } : {}),
  });

  let content: string | undefined;
  if (selected.resolvedLogId) {
    content = await client.getLog(buildId, selected.resolvedLogId, 8_000);
  }

  const payload = {
    logs,
    selected,
    content,
  };

  writeOutput(context, isJson(flags), payload);
}

async function runDiagnose(flags: Record<string, string | boolean>, context: CliContext): Promise<void> {
  const buildIdRaw = flagString(flags, "build-id");
  if (!buildIdRaw) {
    throw new Error("diagnose requires --build-id");
  }

  const buildId = parsePositiveIntegerStrict(buildIdRaw, "--build-id");
  const explicitLogId = flagNumber(flags, "log-id");
  const maxBytes = flagNumber(flags, "max-bytes");
  const jobId = flagString(flags, "job-id");
  const taskId = flagString(flags, "task-id");

  const { client, tokenSource, mock } = await createClientFromFlags(flags, context);

  const diagnostics = await collectBuildFailureDiagnostics(client, {
    buildId,
    ...(jobId !== undefined ? { jobId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    ...(explicitLogId !== undefined ? { logId: explicitLogId } : {}),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
  });

  const payload = {
    mode: mock ? "mock" : "live",
    ...(mock ? {} : { tokenSource }),
    diagnostics,
  };

  if (isJson(flags)) {
    writeOutput(context, true, redactDiagnosticsBundle(payload));
    return;
  }

  const excerpts = diagnostics.logs.excerpts
    .map((excerpt) => {
      const excerptLines = excerpt.text.split("\n");
      const markerOffset = excerpt.lineNumber - excerpt.startLine;
      const markerLine = excerptLines[markerOffset] ?? excerptLines[0] ?? "";
      return `- line ${excerpt.lineNumber} (${excerpt.marker}): ${markerLine}`;
    })
    .join("\n");
  const artifactNames = diagnostics.artifacts.map((artifact) => artifact.name).filter(Boolean).join(", ") || "none";

  const human = [
    diagnostics.summary,
    diagnostics.matchedJobRecord ? `Matched job: ${diagnostics.matchedJobRecord.name ?? diagnostics.matchedJobRecord.id}` : undefined,
    diagnostics.matchedTaskRecord ? `Matched task: ${diagnostics.matchedTaskRecord.name ?? diagnostics.matchedTaskRecord.id}` : undefined,
    `Artifacts (metadata only): ${artifactNames}`,
    diagnostics.logs.excerpts.length > 0 ? `Excerpts:\n${excerpts}` : "Excerpts: none",
  ]
    .filter(Boolean)
    .join("\n");

  writeOutput(context, false, redactSensitiveText(human));
}

async function runArtifacts(flags: Record<string, string | boolean>, context: CliContext): Promise<void> {
  const buildIdRaw = flagString(flags, "build-id");
  if (!buildIdRaw) {
    throw new Error("artifacts requires --build-id");
  }

  const buildId = parsePositiveIntegerStrict(buildIdRaw, "--build-id");
  const { client } = await createClientFromFlags(flags, context);
  const artifacts = await client.listArtifacts(buildId);

  writeOutput(context, isJson(flags), { artifacts });
}

function usage(): string {
  return [
    "Usage:",
    "  pi-ado doctor [--json] [--mock] [--organization <org>] [--project <project>]",
    "  pi-ado status --build-id <id> [--job-id <guid>] [--task-id <guid>] [--json] [--mock]",
    "  pi-ado logs --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--json] [--mock]",
    "  pi-ado diagnose --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--max-bytes <n>] [--json] [--mock]",
    "  pi-ado artifacts --build-id <id> [--json] [--mock]",
  ].join("\n");
}

export async function runCli(argv: string[], context: Partial<CliContext> = {}): Promise<number> {
  const cliContext: CliContext = {
    stdout: context.stdout ?? process.stdout,
    stderr: context.stderr ?? process.stderr,
    env: context.env ?? process.env,
    cwd: context.cwd ?? process.cwd(),
  };

  try {
    const parsed = parseArgs(argv);

    switch (parsed.command) {
      case "doctor":
        await runDoctor(parsed.flags, cliContext);
        return 0;
      case "status":
        await runStatus(parsed.flags, cliContext);
        return 0;
      case "logs":
        await runLogs(parsed.flags, cliContext);
        return 0;
      case "diagnose":
        await runDiagnose(parsed.flags, cliContext);
        return 0;
      case "artifacts":
        await runArtifacts(parsed.flags, cliContext);
        return 0;
      default:
        cliContext.stderr.write(`${usage()}\n`);
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CLI error";
    const token = resolveTokenFromEnv(cliContext.env);
    const redactedMessage = redactSensitiveText(message, getAuthSensitiveValues(token?.token));
    cliContext.stderr.write(`pi-ado failed: ${redactedMessage}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath) {
  const isEntrypoint = fileURLToPath(import.meta.url) === path.resolve(invokedPath);
  if (isEntrypoint) {
    runCli(process.argv.slice(2)).then((code) => {
      process.exitCode = code;
    });
  }
}
