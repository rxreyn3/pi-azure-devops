import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSelectedLogInfo,
  collectBuildFailureDiagnostics,
  createAzureDevOpsClient,
  createFixtureFetch,
  createReadOnlyRestClient,
  downloadArtifact,
  getAuthSensitiveValues,
  redactDiagnosticsBundle,
  redactSensitiveText,
  resolveAzureDevOpsConfig,
  resolveScope,
  resolveTimelineRecordLookups,
  resolveTokenFromEnv,
  selectLogId,
  summarizeTimelineRecords,
  type ArtifactDownloadPreview,
  type ArtifactDownloadResult,
  type ArtifactKind,
  type AzureDevOpsClient,
  type BuildFailureDiagnosticsBundle,
  type BuildSummary,
  type DoctorResult,
  type LogFetchResult,
  type LogSummary,
  type PipelineSummary,
  type SelectedLogInfo,
  type TimelineSummary,
} from "../../core/index.js";

import { DEFAULT_LOG_MAX_BYTES, MAX_LOG_MAX_BYTES } from "../../core/limits.js";
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
  stageId?: string;
  stageName?: string;
  jobId?: string;
  jobName?: string;
  taskId?: string;
  taskName?: string;
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
  stageId?: string;
  stageName?: string;
  jobId?: string;
  jobName?: string;
  taskId?: string;
  taskName?: string;
  logId?: number;
  maxBytes?: number;
  startLine?: number;
  endLine?: number;
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
  /** Length of the response body the server returned for the selected log URL (post-range). */
  contentTotalBytes?: number;
  /** True when `content` was head-truncated by `maxBytesApplied`. Combine with `startLine`/`endLine` for tail/window fetches. */
  contentTruncated?: boolean;
  /** Echoed when the caller requested a line range. */
  contentStartLine?: number;
  contentEndLine?: number;
}

export interface DiagnoseFailureToolInput extends CommonToolInput {
  buildId: number;
  stageId?: string;
  stageName?: string;
  jobId?: string;
  jobName?: string;
  taskId?: string;
  taskName?: string;
  logId?: number;
  maxBytes?: number;
  startLine?: number;
  endLine?: number;
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

  const [build, timelineRecords, logs] = await Promise.all([
    runtime.client.getBuild(input.buildId),
    runtime.client.getTimeline(input.buildId),
    runtime.client.listLogs(input.buildId),
  ]);
  const timeline = summarizeTimelineRecords(timelineRecords);

  const lookups = resolveTimelineRecordLookups(timelineRecords, {
    ...(input.stageId !== undefined ? { stageId: input.stageId } : {}),
    ...(input.stageName !== undefined ? { stageName: input.stageName } : {}),
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.jobName !== undefined ? { jobName: input.jobName } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.taskName !== undefined ? { taskName: input.taskName } : {}),
  });
  const selectedRaw = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: undefined,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const selected = buildSelectedLogInfo(lookups, selectedRaw);

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

  const lookups = resolveTimelineRecordLookups(timelineRecords, {
    ...(input.stageId !== undefined ? { stageId: input.stageId } : {}),
    ...(input.stageName !== undefined ? { stageName: input.stageName } : {}),
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.jobName !== undefined ? { jobName: input.jobName } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.taskName !== undefined ? { taskName: input.taskName } : {}),
  });
  const selected = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: input.logId,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });

  const selectedDetails: SelectedLogInfo = buildSelectedLogInfo(lookups, selected);

  const selectedLog = selected.logId !== undefined ? logs.find((entry) => entry.id === selected.logId) : undefined;
  const logResult: LogFetchResult | undefined =
    selected.logId !== undefined
      ? await runtime.client.getLog(input.buildId, selected.logId, {
          maxBytes: maxBytesApplied,
          ...(input.startLine !== undefined ? { startLine: input.startLine } : {}),
          ...(input.endLine !== undefined ? { endLine: input.endLine } : {}),
        })
      : undefined;
  const logContent = logResult?.content;

  const details: GetLogsToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    buildId: input.buildId,
    logs,
    selected: selectedDetails,
    ...(selectedLog !== undefined ? { selectedLog } : {}),
    maxBytesApplied,
    ...(logContent !== undefined ? { content: redactSensitiveText(logContent, runtime.authSensitiveValues) } : {}),
    ...(logResult !== undefined ? { contentTotalBytes: logResult.totalBytes } : {}),
    ...(logResult !== undefined ? { contentTruncated: logResult.truncated } : {}),
    ...(input.startLine !== undefined ? { contentStartLine: input.startLine } : {}),
    ...(input.endLine !== undefined ? { contentEndLine: input.endLine } : {}),
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
    ...(input.stageId !== undefined ? { stageId: input.stageId } : {}),
    ...(input.stageName !== undefined ? { stageName: input.stageName } : {}),
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.jobName !== undefined ? { jobName: input.jobName } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.taskName !== undefined ? { taskName: input.taskName } : {}),
    ...(input.logId !== undefined ? { logId: input.logId } : {}),
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    ...(input.startLine !== undefined ? { startLine: input.startLine } : {}),
    ...(input.endLine !== undefined ? { endLine: input.endLine } : {}),
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

export interface DownloadArtifactToolInput extends CommonToolInput {
  buildId: number;
  artifactName: string;
  outputPath: string;
  confirm?: boolean;
  extract?: boolean;
  overwrite?: boolean;
  maxBytes?: number;
  artifactKind?: ArtifactKind;
  pipelineId?: number;
  runId?: number;
}

export interface DownloadArtifactToolDetails {
  mode: "mock" | "live";
  scope: {
    organization: string;
    project: string;
    profile?: string;
  };
  outcome: ArtifactDownloadPreview | ArtifactDownloadResult;
  semantics: string;
}

export async function runDownloadArtifactTool(
  input: DownloadArtifactToolInput,
  partialContext: Partial<ToolRuntimeContext> = {},
): Promise<ToolResult<DownloadArtifactToolDetails>> {
  const context = createToolRuntimeContext(partialContext);
  const runtime = await createReadOnlyRuntime(input, context);

  const outcome = await downloadArtifact(runtime.client, {
    buildId: input.buildId,
    artifactName: input.artifactName,
    outputPath: input.outputPath,
    cwd: context.cwd,
    confirm: input.confirm === true,
    extract: input.extract === true,
    overwrite: input.overwrite === true,
    artifactKind: input.artifactKind ?? "auto",
    ...(input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}),
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
  });

  const details: DownloadArtifactToolDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    outcome,
    semantics:
      outcome.status === "preview"
        ? "Preview only; no file writes performed. Pass confirm=true to download. Signed URLs are redacted."
        : "Local file write completed under cwd. Signed URLs are redacted from output.",
  };

  return {
    content: [
      {
        type: "text",
        text: formatToolText(
          "azure_devops_download_artifact",
          details,
          runtime.authSensitiveValues,
        ),
      },
    ],
    details,
  };
}
