import {
  buildSelectedLogInfo,
  resolveTimelineRecordLookups,
  selectLogId,
  summarizeTimelineRecords,
  type LogFetchResult,
} from "../client.js";
import {
  collectBuildFailureDiagnostics,
  redactDiagnosticsBundle,
  type BuildFailureDiagnosticsBundle,
} from "../diagnostics.js";
import { downloadArtifact } from "../artifact-download.js";
import type {
  ArtifactDownloadPreview,
  ArtifactDownloadResult,
  ArtifactKind,
  BuildSummary,
  LogSummary,
  PipelineSummary,
  SelectedLogInfo,
  TimelineSummary,
} from "../models.js";
import { redactSensitiveText } from "../redact.js";

import {
  createOperationRuntime,
  resolveDoctorRuntime,
  safeMaxBytes,
  safeTop,
} from "./runtime.js";
import type {
  AzureDevOpsOperation,
  OperationResult,
  OperationRuntimeContext,
  OperationScope,
} from "./types.js";

interface CommonInput {
  profile?: string;
  organization?: string;
  project?: string;
  mock?: boolean;
}

interface SelectorInput {
  stageId?: string;
  stageName?: string;
  jobId?: string;
  jobName?: string;
  taskId?: string;
  taskName?: string;
}

interface LogRangeInput {
  logId?: number;
  maxBytes?: number;
  startLine?: number;
  endLine?: number;
}

function pickSelector(input: SelectorInput) {
  return {
    ...(input.stageId !== undefined ? { stageId: input.stageId } : {}),
    ...(input.stageName !== undefined ? { stageName: input.stageName } : {}),
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.jobName !== undefined ? { jobName: input.jobName } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    ...(input.taskName !== undefined ? { taskName: input.taskName } : {}),
  };
}

// ---------- doctor ----------

export type DoctorInput = CommonInput;

export interface DoctorDetails {
  mode: "mock" | "live";
  readyForReadOnlyLive: boolean;
  config: {
    organization?: string;
    project?: string;
    profile?: string;
    sources: Record<string, string>;
    configFilesChecked: string[];
  };
  auth: {
    tokenFound: boolean;
    tokenSource?: string;
  };
  warnings: string[];
}

export async function runDoctorOperation(
  input: DoctorInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<DoctorDetails>> {
  const runtime = await resolveDoctorRuntime(input, context);
  const { config, token, mode } = runtime;

  const details: DoctorDetails = {
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

  return { details, sensitiveValues: [] };
}

// ---------- get status ----------

export interface GetStatusInput extends CommonInput, SelectorInput {
  buildId: number;
}

export interface GetStatusDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  build: BuildSummary | undefined;
  timeline: TimelineSummary;
  selected: SelectedLogInfo;
}

export async function runGetStatusOperation(
  input: GetStatusInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<GetStatusDetails>> {
  const runtime = await createOperationRuntime(input, context);

  const [build, timelineRecords, logs] = await Promise.all([
    runtime.client.getBuild(input.buildId),
    runtime.client.getTimeline(input.buildId),
    runtime.client.listLogs(input.buildId),
  ]);
  const timeline = summarizeTimelineRecords(timelineRecords);

  const lookups = resolveTimelineRecordLookups(timelineRecords, pickSelector(input));
  const selectedRaw = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: undefined,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const selected = buildSelectedLogInfo(lookups, selectedRaw);

  const details: GetStatusDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    build,
    timeline,
    selected,
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// ---------- get logs ----------

export interface GetLogsInput extends CommonInput, SelectorInput, LogRangeInput {
  buildId: number;
}

export interface GetLogsDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  buildId: number;
  logs: LogSummary[];
  selected: SelectedLogInfo;
  selectedLog?: LogSummary;
  maxBytesApplied: number;
  content?: string;
  contentTotalBytes?: number;
  contentTruncated?: boolean;
  contentStartLine?: number;
  contentEndLine?: number;
}

export async function runGetLogsOperation(
  input: GetLogsInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<GetLogsDetails>> {
  const runtime = await createOperationRuntime(input, context);
  const maxBytesApplied = safeMaxBytes(input.maxBytes);

  const [timelineRecords, logs] = await Promise.all([
    runtime.client.getTimeline(input.buildId),
    runtime.client.listLogs(input.buildId),
  ]);

  const lookups = resolveTimelineRecordLookups(timelineRecords, pickSelector(input));
  const selectedRaw = selectLogId({
    taskRecord: lookups.matchedTaskRecord,
    jobRecord: lookups.matchedJobRecord,
    explicitLogId: input.logId,
    logs: lookups.anySelectorRequested ? undefined : logs,
  });
  const selected = buildSelectedLogInfo(lookups, selectedRaw);

  const selectedLog =
    selectedRaw.logId !== undefined ? logs.find((entry) => entry.id === selectedRaw.logId) : undefined;
  const logResult: LogFetchResult | undefined =
    selectedRaw.logId !== undefined
      ? await runtime.client.getLog(input.buildId, selectedRaw.logId, {
          maxBytes: maxBytesApplied,
          ...(input.startLine !== undefined ? { startLine: input.startLine } : {}),
          ...(input.endLine !== undefined ? { endLine: input.endLine } : {}),
        })
      : undefined;

  const details: GetLogsDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    buildId: input.buildId,
    logs,
    selected,
    ...(selectedLog !== undefined ? { selectedLog } : {}),
    maxBytesApplied,
    ...(logResult !== undefined
      ? { content: redactSensitiveText(logResult.content, runtime.authSensitiveValues) }
      : {}),
    ...(logResult !== undefined ? { contentTotalBytes: logResult.totalBytes } : {}),
    ...(logResult !== undefined ? { contentTruncated: logResult.truncated } : {}),
    ...(input.startLine !== undefined ? { contentStartLine: input.startLine } : {}),
    ...(input.endLine !== undefined ? { contentEndLine: input.endLine } : {}),
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// ---------- diagnose failure ----------

export interface DiagnoseFailureInput extends CommonInput, SelectorInput, LogRangeInput {
  buildId: number;
}

export interface DiagnoseFailureDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  diagnostics: BuildFailureDiagnosticsBundle;
}

export async function runDiagnoseFailureOperation(
  input: DiagnoseFailureInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<DiagnoseFailureDetails>> {
  const runtime = await createOperationRuntime(input, context);

  const diagnostics = await collectBuildFailureDiagnostics(runtime.client, {
    buildId: input.buildId,
    ...pickSelector(input),
    ...(input.logId !== undefined ? { logId: input.logId } : {}),
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    ...(input.startLine !== undefined ? { startLine: input.startLine } : {}),
    ...(input.endLine !== undefined ? { endLine: input.endLine } : {}),
  });

  const details: DiagnoseFailureDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    diagnostics: redactDiagnosticsBundle(diagnostics, runtime.authSensitiveValues),
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// ---------- list artifacts ----------

export interface ListArtifactsInput extends CommonInput {
  buildId: number;
}

export interface ArtifactMetadataSummary {
  id?: number;
  name?: string;
  resourceType?: string;
  downloadUrl?: string;
}

export interface ListArtifactsDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  buildId: number;
  artifacts: ArtifactMetadataSummary[];
  noDownloadSemantics: string;
}

export async function runListArtifactsOperation(
  input: ListArtifactsInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<ListArtifactsDetails>> {
  const runtime = await createOperationRuntime(input, context);
  const artifacts = await runtime.client.listArtifacts(input.buildId);

  const redactedArtifacts: ArtifactMetadataSummary[] = artifacts.map((artifact) => ({
    ...artifact,
    ...(artifact.downloadUrl !== undefined
      ? { downloadUrl: redactSensitiveText(artifact.downloadUrl, runtime.authSensitiveValues) }
      : {}),
  }));

  const details: ListArtifactsDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    buildId: input.buildId,
    artifacts: redactedArtifacts,
    noDownloadSemantics:
      "Metadata only. This read-only tool does not download, write, or extract artifacts.",
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// ---------- list pipelines ----------

export interface ListPipelinesInput extends CommonInput {
  top?: number;
}

export interface ListPipelinesDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  topApplied: number;
  pipelines: PipelineSummary[];
}

export async function runListPipelinesOperation(
  input: ListPipelinesInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<ListPipelinesDetails>> {
  const runtime = await createOperationRuntime(input, context);
  const topApplied = safeTop(input.top);
  const pipelines = await runtime.client.listPipelines(topApplied);

  const details: ListPipelinesDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    topApplied,
    pipelines,
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// ---------- list builds ----------

export interface ListBuildsInput extends CommonInput {
  top?: number;
}

export interface ListBuildsDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  topApplied: number;
  builds: BuildSummary[];
}

export async function runListBuildsOperation(
  input: ListBuildsInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<ListBuildsDetails>> {
  const runtime = await createOperationRuntime(input, context);
  const topApplied = safeTop(input.top);
  const builds = await runtime.client.listBuilds(topApplied);

  const details: ListBuildsDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    topApplied,
    builds,
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// ---------- download artifact ----------

export interface DownloadArtifactInput extends CommonInput {
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

export interface DownloadArtifactDetails {
  mode: "mock" | "live";
  scope: OperationScope;
  outcome: ArtifactDownloadPreview | ArtifactDownloadResult;
  semantics: string;
}

export async function runDownloadArtifactOperation(
  input: DownloadArtifactInput,
  context: OperationRuntimeContext,
): Promise<OperationResult<DownloadArtifactDetails>> {
  const runtime = await createOperationRuntime(input, context);

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

  const details: DownloadArtifactDetails = {
    mode: runtime.mode,
    scope: runtime.scope,
    outcome,
    semantics:
      outcome.status === "preview"
        ? "Preview only; no file writes performed. Pass confirm=true to download. Signed URLs are redacted."
        : "Local file write completed under cwd. Signed URLs are redacted from output.",
  };

  return { details, sensitiveValues: runtime.authSensitiveValues };
}

// Re-export operation type for convenience.
export type { AzureDevOpsOperation };
