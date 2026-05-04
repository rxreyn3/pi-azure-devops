import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectBuildFailureDiagnostics,
  createAzureDevOpsClient,
  createFixtureFetch,
  createReadOnlyRestClient,
  findTimelineRecordById,
  getAuthSensitiveValues,
  redactDiagnosticsBundle,
  redactSensitiveText,
  resolveAzureDevOpsConfig,
  resolveScope,
  resolveTokenFromEnv,
  selectLogId,
  summarizeTimelineRecords,
  type AzureDevOpsClient,
  type BuildFailureDiagnosticsBundle,
  type BuildSummary,
  type DoctorResult,
  type LogSummary,
  type PipelineSummary,
  type SelectedLogInfo,
  type TimelineSummary,
} from "../../core/index.js";

const DEFAULT_LOG_MAX_BYTES = 8_000;
const MAX_LOG_MAX_BYTES = 100_000;
const DEFAULT_TOP = 10;
const MAX_TOP = 50;

export interface ToolRuntimeContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface ToolResult<TDetails> {
  content: Array<{ type: "text"; text: string }>;
  details: TDetails;
}

export interface CommonToolInput {
  profile?: string;
  organization?: string;
  project?: string;
  mock?: boolean;
}

export interface DoctorToolInput extends CommonToolInput {}

export interface GetStatusToolInput extends CommonToolInput {
  buildId: number;
  jobId?: string;
  taskId?: string;
}

export interface GetStatusToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  build: BuildSummary | undefined;
  timeline: TimelineSummary;
  selected: SelectedLogInfo;
}

export interface GetLogsToolInput extends CommonToolInput {
  buildId: number;
  jobId?: string;
  taskId?: string;
  logId?: number;
  maxBytes?: number;
}

export interface GetLogsToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  buildId: number;
  logs: LogSummary[];
  selected: SelectedLogInfo;
  selectedLog?: LogSummary;
  maxBytesApplied: number;
  content?: string;
}

export interface DiagnoseFailureToolInput extends CommonToolInput {
  buildId: number;
  jobId?: string;
  taskId?: string;
  logId?: number;
  maxBytes?: number;
}

export interface DiagnoseFailureToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  diagnostics: BuildFailureDiagnosticsBundle;
}

export interface ListArtifactsToolInput extends CommonToolInput {
  buildId: number;
}

export interface ArtifactMetadataSummary {
  id?: number;
  name?: string;
  resourceType?: string;
  downloadUrl?: string;
}

export interface ListArtifactsToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  buildId: number;
  artifacts: ArtifactMetadataSummary[];
  noDownloadSemantics: string;
}

export interface ListPipelinesToolInput extends CommonToolInput {
  top?: number;
}

export interface ListPipelinesToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  topApplied: number;
  pipelines: PipelineSummary[];
}

export interface ListBuildsToolInput extends CommonToolInput {
  top?: number;
}

export interface ListBuildsToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  topApplied: number;
  builds: BuildSummary[];
}

interface RuntimeDependencies {
  mode: "mock" | "live";
  client: AzureDevOpsClient;
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  authSensitiveValues: string[];
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function safeTop(value?: number): number {
  if (value === undefined) return DEFAULT_TOP;
  return clampInteger(value, 1, MAX_TOP);
}

function safeMaxBytes(value?: number): number {
  if (value === undefined) return DEFAULT_LOG_MAX_BYTES;
  return clampInteger(value, 1, MAX_LOG_MAX_BYTES);
}

function formatToolText(title: string, payload: unknown, additionalSensitiveValues: string[] = []): string {
  const serialized = JSON.stringify(payload, null, 2);
  const redacted = redactSensitiveText(serialized, additionalSensitiveValues);
  return `${title}\n${redacted}`;
}

function findWorkspaceRoot(startFile: string): string {
  let current = path.dirname(startFile);

  while (true) {
    const candidate = path.join(current, "package.json");
    if (existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function createToolRuntimeContext(partial?: Partial<ToolRuntimeContext>): ToolRuntimeContext {
  return {
    cwd: partial?.cwd ?? process.cwd(),
    env: partial?.env ?? process.env,
  };
}

async function createReadOnlyRuntime(input: CommonToolInput, context: ToolRuntimeContext): Promise<RuntimeDependencies> {
  const config = await resolveAzureDevOpsConfig({
    ...(input.organization !== undefined ? { organization: input.organization } : {}),
    ...(input.project !== undefined ? { project: input.project } : {}),
    ...(input.profile !== undefined ? { profile: input.profile } : {}),
    env: context.env,
    cwd: context.cwd,
  });

  const mode: "mock" | "live" = input.mock ? "mock" : "live";

  if (mode === "mock") {
    const scope = resolveScope({
      organization: config.organization ?? "mock-org",
      project: config.project ?? "mock-project",
    });

    const sourceFile = fileURLToPath(import.meta.url);
    const workspaceRoot = findWorkspaceRoot(sourceFile);
    const rest = createReadOnlyRestClient({
      token: "mock-token",
      fetchImpl: createFixtureFetch(workspaceRoot),
    });

    return {
      mode,
      client: createAzureDevOpsClient(scope, rest),
      scope: {
        organization: scope.organization,
        project: scope.project,
        ...(config.profile !== undefined ? { profile: config.profile } : {}),
      },
      authSensitiveValues: [],
    };
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
    mode,
    client: createAzureDevOpsClient(scope, rest),
    scope: {
      organization: scope.organization,
      project: scope.project,
      ...(config.profile !== undefined ? { profile: config.profile } : {}),
    },
    authSensitiveValues: getAuthSensitiveValues(token.token),
  };
}

function redactArtifactMetadata(
  artifacts: Array<{ id?: number; name?: string; resourceType?: string; downloadUrl?: string }>,
  additionalSensitiveValues: string[],
): ArtifactMetadataSummary[] {
  return artifacts.map((artifact) => ({
    ...artifact,
    ...(artifact.downloadUrl !== undefined
      ? { downloadUrl: redactSensitiveText(artifact.downloadUrl, additionalSensitiveValues) }
      : {}),
  }));
}

export async function runDoctorTool(
  input: DoctorToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<DoctorResult & { mode: "mock" | "live"; readyForReadOnlyLive: boolean }>> {
  const context = createToolRuntimeContext(partialContext);
  const mode: "mock" | "live" = input.mock ? "mock" : "live";

  const config = await resolveAzureDevOpsConfig({
    ...(input.organization !== undefined ? { organization: input.organization } : {}),
    ...(input.project !== undefined ? { project: input.project } : {}),
    ...(input.profile !== undefined ? { profile: input.profile } : {}),
    env: context.env,
    cwd: context.cwd,
  });

  const token = resolveTokenFromEnv(context.env);

  const details: DoctorResult & { mode: "mock" | "live"; readyForReadOnlyLive: boolean } = {
    mode,
    readyForReadOnlyLive: Boolean(config.organization && config.project && token),
    config: {
      ...(config.organization !== undefined ? { organization: config.organization } : {}),
      ...(config.project !== undefined ? { project: config.project } : {}),
      ...(config.profile !== undefined ? { profile: config.profile } : {}),
      sources: config.sources,
      configFilesChecked: config.configFilesChecked,
    },
    auth: {
      tokenFound: Boolean(token),
      ...(token?.source ? { tokenSource: token.source } : {}),
    },
    warnings: [
      ...config.warnings,
      ...(config.organization ? [] : ["Missing organization (set organization override, env, or config)"]),
      ...(config.project ? [] : ["Missing project (set project override, env, or config)"]),
      ...(token ? [] : ["Missing token env value"]),
      ...(mode === "mock" ? ["Mock mode enabled; network checks were skipped."] : []),
    ],
  };

  return {
    content: [{ type: "text", text: formatToolText("azure_devops_doctor", details) }],
    details,
  };
}

export async function runGetStatusTool(
  input: GetStatusToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<GetStatusToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);

  const build = await runtime.client.getBuild(input.buildId);
  const timelineRecords = await runtime.client.getTimeline(input.buildId);
  const timeline = summarizeTimelineRecords(timelineRecords);
  const selected = await runtime.client.resolveBuildLogSelection({
    buildId: input.buildId,
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
  });

  const details: GetStatusToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    build,
    timeline,
    selected,
  };

  return {
    content: [{ type: "text", text: formatToolText("azure_devops_get_status", details, runtime.authSensitiveValues) }],
    details,
  };
}

export async function runGetLogsTool(
  input: GetLogsToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<GetLogsToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);
  const maxBytesApplied = safeMaxBytes(input.maxBytes);

  const timelineRecords = await runtime.client.getTimeline(input.buildId);
  const logs = await runtime.client.listLogs(input.buildId);

  const matchedJob = findTimelineRecordById(timelineRecords, input.jobId);
  const matchedTask = findTimelineRecordById(timelineRecords, input.taskId);
  const selected = selectLogId({
    taskRecord: matchedTask,
    jobRecord: matchedJob,
    explicitLogId: input.logId,
    logs,
  });

  const selectedDetails: SelectedLogInfo = {
    ...(matchedJob?.id ? { matchedJobRecordId: matchedJob.id } : {}),
    ...(matchedTask?.id ? { matchedTaskRecordId: matchedTask.id } : {}),
    ...(selected.logId ? { resolvedLogId: selected.logId } : {}),
    ...(selected.source ? { resolvedLogSource: selected.source } : {}),
  };

  const selectedLog = selected.logId ? logs.find((entry) => entry.id === selected.logId) : undefined;
  const logContent =
    selected.logId !== undefined
      ? await runtime.client.getLog(input.buildId, selected.logId, maxBytesApplied)
      : undefined;

  const details: GetLogsToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    buildId: input.buildId,
    logs,
    selected: selectedDetails,
    ...(selectedLog ? { selectedLog } : {}),
    maxBytesApplied,
    ...(logContent !== undefined ? { content: redactSensitiveText(logContent, runtime.authSensitiveValues) } : {}),
  };

  return {
    content: [{ type: "text", text: formatToolText("azure_devops_get_logs", details, runtime.authSensitiveValues) }],
    details,
  };
}

export async function runDiagnoseFailureTool(
  input: DiagnoseFailureToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<DiagnoseFailureToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);

  const diagnostics = await collectBuildFailureDiagnostics(runtime.client, {
    buildId: input.buildId,
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.logId !== undefined ? { logId: input.logId } : {}),
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
  });
  const redactedDiagnostics = redactDiagnosticsBundle(diagnostics, runtime.authSensitiveValues);

  const details: DiagnoseFailureToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    diagnostics: redactedDiagnostics,
  };

  return {
    content: [
      {
        type: "text",
        text: formatToolText("azure_devops_diagnose_failure", details, runtime.authSensitiveValues),
      },
    ],
    details,
  };
}

export async function runListArtifactsTool(
  input: ListArtifactsToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<ListArtifactsToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);

  const artifacts = await runtime.client.listArtifacts(input.buildId);
  const redactedArtifacts = redactArtifactMetadata(artifacts, runtime.authSensitiveValues);

  const details: ListArtifactsToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    buildId: input.buildId,
    artifacts: redactedArtifacts,
    noDownloadSemantics: "Metadata only. This read-only tool does not download, write, or extract artifacts.",
  };

  return {
    content: [{ type: "text", text: formatToolText("azure_devops_list_artifacts", details, runtime.authSensitiveValues) }],
    details,
  };
}

export async function runListPipelinesTool(
  input: ListPipelinesToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<ListPipelinesToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);
  const topApplied = safeTop(input.top);

  const pipelines = await runtime.client.listPipelines(topApplied);

  const details: ListPipelinesToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    topApplied,
    pipelines,
  };

  return {
    content: [{ type: "text", text: formatToolText("azure_devops_list_pipelines", details, runtime.authSensitiveValues) }],
    details,
  };
}

export async function runListBuildsTool(
  input: ListBuildsToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<ListBuildsToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);
  const topApplied = safeTop(input.top);

  const builds = await runtime.client.listBuilds(topApplied);

  const details: ListBuildsToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    topApplied,
    builds,
  };

  return {
    content: [{ type: "text", text: formatToolText("azure_devops_list_builds", details, runtime.authSensitiveValues) }],
    details,
  };
}
