import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadOnlyEndpoints,
  createAzureDevOpsClient,
  createFixtureFetch,
  createReadOnlyRestClient,
  findTimelineRecordById,
  resolveScope,
  resolveTokenFromEnv,
  selectLogId,
  summarizeTimelineRecords,
  type LogSelectionSource,
  type OperationStatus,
  type TimelineRecord,
} from "../src/core/index.js";
import { parseNonEmptyString, parsePositiveIntegerStrict } from "../src/core/parsing.js";

interface CliOptions {
  organization?: string;
  project?: string;
  pipelineId?: number;
  buildId?: number;
  runId?: number;
  jobId?: string;
  taskId?: string;
  logId?: number;
  top: number;
  json: boolean;
  mock: boolean;
}

interface OperationResult {
  name:
    | "listPipelines"
    | "listBuilds"
    | "getBuild"
    | "getRun"
    | "getTimeline"
    | "listLogs"
    | "getLog"
    | "listArtifacts";
  status: OperationStatus;
  endpoint?: string;
  message?: string;
  itemCount?: number;
}

interface SpikeOutput {
  mode: "mock" | "live";
  scope: {
    organization: string | undefined;
    project: string | undefined;
    pipelineId: number | undefined;
    buildId: number | undefined;
    runId: number | undefined;
    jobId: string | undefined;
    taskId: string | undefined;
    logId: number | undefined;
    top: number;
  };
  operations: OperationResult[];
  selected: {
    pipelineId: number | undefined;
    buildId: number | undefined;
    runId: number | undefined;
    requestedJobId: string | undefined;
    requestedTaskId: string | undefined;
    requestedLogId: number | undefined;
    matchedJobRecordId: string | undefined;
    matchedTaskRecordId: string | undefined;
    resolvedLogId: number | undefined;
    resolvedLogSource: LogSelectionSource | undefined;
  };
  timeline:
    | {
        totalRecords: number;
        failedRecords: number;
        warningCount: number;
        problemCount: number;
      }
    | undefined;
  summary: Record<OperationStatus, number>;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    top: 3,
    json: false,
    mock: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--mock") {
      options.mock = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case "--organization":
        options.organization = parseNonEmptyString(next, arg);
        break;
      case "--project":
        options.project = parseNonEmptyString(next, arg);
        break;
      case "--pipeline-id":
        options.pipelineId = parsePositiveIntegerStrict(next, arg);
        break;
      case "--build-id":
        options.buildId = parsePositiveIntegerStrict(next, arg);
        break;
      case "--run-id":
        options.runId = parsePositiveIntegerStrict(next, arg);
        break;
      case "--job-id":
        options.jobId = parseNonEmptyString(next, arg);
        break;
      case "--task-id":
        options.taskId = parseNonEmptyString(next, arg);
        break;
      case "--log-id":
        options.logId = parsePositiveIntegerStrict(next, arg);
        break;
      case "--top":
        options.top = parsePositiveIntegerStrict(next, arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }

    i += 1;
  }

  return options;
}

function summarizeStatuses(operations: OperationResult[]): Record<OperationStatus, number> {
  const summary: Record<OperationStatus, number> = {
    mocked: 0,
    verified: 0,
    skipped: 0,
    failed: 0,
  };

  for (const operation of operations) {
    summary[operation.status] += 1;
  }

  return summary;
}

function rootDirFromCurrentFile(currentFile: string): string {
  return path.resolve(path.dirname(currentFile), "..");
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.mock && (!options.organization || !options.project)) {
    throw new Error("Live mode requires --organization and --project");
  }

  const token = options.mock ? { token: "mock-token", source: "mock" } : resolveTokenFromEnv();
  if (!token) {
    throw new Error(
      "Live mode requires a token in one of: PI_AZURE_DEVOPS_PAT, PI_ADO_PAT, AZURE_DEVOPS_PAT, AZURE_DEVOPS_EXT_PAT, ADO_PAT, SYSTEM_ACCESSTOKEN",
    );
  }

  const thisFilePath = fileURLToPath(import.meta.url);
  const repoRoot = rootDirFromCurrentFile(thisFilePath);
  const mockOrganization = options.organization ?? "mock-org";
  const mockProject = options.project ?? "mock-project";

  const scope = resolveScope({
    organization: options.mock ? mockOrganization : (options.organization as string),
    project: options.mock ? mockProject : (options.project as string),
  });

  const rest = createReadOnlyRestClient({
    token: token.token,
    ...(options.mock ? { fetchImpl: createFixtureFetch(repoRoot) } : {}),
  });
  const client = createAzureDevOpsClient(scope, rest);
  const endpoints = buildReadOnlyEndpoints(scope);

  const statusFromMode: OperationStatus = options.mock ? "mocked" : "verified";
  const operations: OperationResult[] = [];

  const selected: SpikeOutput["selected"] = {
    pipelineId: options.pipelineId,
    buildId: options.buildId,
    runId: options.runId,
    requestedJobId: options.jobId,
    requestedTaskId: options.taskId,
    requestedLogId: options.logId,
    matchedJobRecordId: undefined,
    matchedTaskRecordId: undefined,
    resolvedLogId: undefined,
    resolvedLogSource: undefined,
  };

  let timelineRecords: TimelineRecord[] = [];
  let timelineSummary: SpikeOutput["timeline"];
  let listedLogs: Awaited<ReturnType<typeof client.listLogs>> = [];

  try {
    const pipelines = await client.listPipelines(options.top);
    if (!selected.pipelineId) {
      selected.pipelineId = pipelines[0]?.id;
    }
    operations.push({
      name: "listPipelines",
      status: statusFromMode,
      endpoint: endpoints.listPipelines(options.top),
      itemCount: pipelines.length,
    });
  } catch (error) {
    operations.push({
      name: "listPipelines",
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  try {
    const builds = await client.listBuilds(options.top);
    if (!selected.buildId) {
      selected.buildId = builds[0]?.id;
    }
    operations.push({
      name: "listBuilds",
      status: statusFromMode,
      endpoint: endpoints.listBuilds(options.top),
      itemCount: builds.length,
    });
  } catch (error) {
    operations.push({
      name: "listBuilds",
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  if (!selected.buildId) {
    operations.push({
      name: "getBuild",
      status: "skipped",
      message: "No build id available. Provide --build-id or ensure builds list returns data.",
    });
  } else {
    try {
      const build = await client.getBuild(selected.buildId);
      operations.push({
        name: "getBuild",
        status: statusFromMode,
        endpoint: endpoints.getBuild(selected.buildId),
        itemCount: build ? 1 : 0,
      });
    } catch (error) {
      operations.push({
        name: "getBuild",
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!selected.runId || !selected.pipelineId) {
    operations.push({
      name: "getRun",
      status: "skipped",
      message:
        "Requires both run and pipeline ids. Provide --run-id and --pipeline-id (or ensure list pipelines can supply a pipeline id).",
    });
  } else {
    try {
      const runData = await client.getRun(selected.pipelineId, selected.runId);
      operations.push({
        name: "getRun",
        status: statusFromMode,
        endpoint: endpoints.getRun(selected.pipelineId, selected.runId),
        itemCount: runData ? 1 : 0,
      });
    } catch (error) {
      operations.push({
        name: "getRun",
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!selected.buildId) {
    operations.push({
      name: "getTimeline",
      status: "skipped",
      message: "Requires build id. Provide --build-id.",
    });
  } else {
    try {
      timelineRecords = await client.getTimeline(selected.buildId);
      const matchedJob = findTimelineRecordById(timelineRecords, options.jobId);
      const matchedTask = findTimelineRecordById(timelineRecords, options.taskId);
      selected.matchedJobRecordId = matchedJob?.id;
      selected.matchedTaskRecordId = matchedTask?.id;

      const summary = summarizeTimelineRecords(timelineRecords);
      timelineSummary = {
        ...summary,
      };

      operations.push({
        name: "getTimeline",
        status: statusFromMode,
        endpoint: endpoints.getTimeline(selected.buildId),
        itemCount: timelineRecords.length,
        message: `failed=${summary.failedRecords}, warnings=${summary.warningCount}, problems=${summary.problemCount}`,
      });
    } catch (error) {
      operations.push({
        name: "getTimeline",
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!selected.buildId) {
    operations.push({
      name: "listLogs",
      status: "skipped",
      message: "Requires build id. Provide --build-id.",
    });
  } else {
    try {
      listedLogs = await client.listLogs(selected.buildId);
      operations.push({
        name: "listLogs",
        status: statusFromMode,
        endpoint: endpoints.listLogs(selected.buildId),
        itemCount: listedLogs.length,
      });
    } catch (error) {
      operations.push({
        name: "listLogs",
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (selected.buildId) {
    const matchedJob = findTimelineRecordById(timelineRecords, options.jobId);
    const matchedTask = findTimelineRecordById(timelineRecords, options.taskId);
    const selectedLog = selectLogId({
      taskRecord: matchedTask,
      jobRecord: matchedJob,
      explicitLogId: options.logId,
      logs: listedLogs,
    });

    selected.resolvedLogId = selectedLog.logId;
    selected.resolvedLogSource = selectedLog.source;
  }

  if (!selected.buildId || !selected.resolvedLogId) {
    operations.push({
      name: "getLog",
      status: "skipped",
      message:
        "Requires build id and log id. Provide --build-id and optionally --job-id/--task-id/--log-id, or ensure logs exist.",
    });
  } else {
    try {
      const result = await client.getLog(selected.buildId, selected.resolvedLogId, { maxBytes: 8_000 });
      operations.push({
        name: "getLog",
        status: statusFromMode,
        endpoint: endpoints.getLog(selected.buildId, selected.resolvedLogId),
        itemCount: result.content.length,
      });
    } catch (error) {
      operations.push({
        name: "getLog",
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!selected.buildId) {
    operations.push({
      name: "listArtifacts",
      status: "skipped",
      message: "Requires build id. Provide --build-id.",
    });
  } else {
    try {
      const artifacts = await client.listArtifacts(selected.buildId);
      operations.push({
        name: "listArtifacts",
        status: statusFromMode,
        endpoint: endpoints.listArtifacts(selected.buildId),
        itemCount: artifacts.length,
      });
    } catch (error) {
      operations.push({
        name: "listArtifacts",
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const output: SpikeOutput = {
    mode: options.mock ? "mock" : "live",
    scope: {
      organization: options.organization,
      project: options.project,
      pipelineId: options.pipelineId,
      buildId: options.buildId,
      runId: options.runId,
      jobId: options.jobId,
      taskId: options.taskId,
      logId: options.logId,
      top: options.top,
    },
    operations,
    selected,
    timeline: timelineSummary,
    summary: summarizeStatuses(operations),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  process.stdout.write(`ado-rest-spike (${output.mode})\n`);
  process.stdout.write(`top=${output.scope.top}\n`);
  for (const op of output.operations) {
    const extras = [op.itemCount !== undefined ? `count=${op.itemCount}` : undefined, op.message]
      .filter(Boolean)
      .join(" | ");
    process.stdout.write(`- ${op.name}: ${op.status}${extras ? ` | ${extras}` : ""}\n`);
  }

  if (output.selected.resolvedLogId) {
    process.stdout.write(`selected log: ${output.selected.resolvedLogId} (${output.selected.resolvedLogSource ?? "unknown"})\n`);
  }

  process.stdout.write(
    `summary: mocked=${output.summary.mocked}, verified=${output.summary.verified}, skipped=${output.summary.skipped}, failed=${output.summary.failed}\n`,
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`ado-rest-spike failed: ${message}\n`);
  process.exitCode = 1;
});
