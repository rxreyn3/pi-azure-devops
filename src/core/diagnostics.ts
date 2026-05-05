import { redactSensitiveText } from "./redact.js";
import { DEFAULT_LOG_MAX_BYTES, MAX_LOG_MAX_BYTES } from "./limits.js";
import {
  buildSelectedLogInfo,
  resolveTimelineRecordLookups,
  selectLogId,
  summarizeTimelineRecords,
  type AzureDevOpsClient,
} from "./client.js";
import type {
  ArtifactSummary,
  BuildSummary,
  LogSummary,
  SelectedLogInfo,
  TimelineRecord,
  TimelineSummary,
} from "./models.js";
// Local aliases retain prior naming; the canonical caps live in `./limits.ts`.
const DEFAULT_MAX_BYTES = DEFAULT_LOG_MAX_BYTES;
const MAX_MAX_BYTES = MAX_LOG_MAX_BYTES;
const DEFAULT_CONTEXT_LINES = 2;
const DEFAULT_MAX_EXCERPTS = 5;

const LOG_MARKERS: Array<{ marker: string; priority: number; test: RegExp }> = [
  { marker: "error", priority: 3, test: /\berror\b/i },
  { marker: "exception", priority: 3, test: /\bexception\b/i },
  { marker: "failed", priority: 3, test: /\bfailed?\b/i },
  { marker: "warning", priority: 1, test: /\bwarn(?:ing)?\b/i },
];

export interface BuildFailureDiagnosticsInput {
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

export interface TimelineRecordEvidence {
  id: string;
  parentId?: string;
  type?: string;
  name?: string;
  result?: string;
  state?: string;
  logId?: number;
  issueMessages: string[];
}

export interface LogExcerpt {
  marker: string;
  lineNumber: number;
  startLine: number;
  endLine: number;
  text: string;
}

export interface BuildFailureDiagnosticsBundle {
  buildId: number;
  build?: BuildSummary;
  timelineSummary: TimelineSummary;
  failedRecords: TimelineRecordEvidence[];
  canceledRecords: TimelineRecordEvidence[];
  matchedStageRecord?: TimelineRecordEvidence;
  matchedJobRecord?: TimelineRecordEvidence;
  matchedTaskRecord?: TimelineRecordEvidence;
  issueMessages: string[];
  logs: {
    available: LogSummary[];
    selected: SelectedLogInfo;
    selectedLog?: LogSummary;
    maxBytesApplied: number;
    content?: string;
    /** Length (in JS string code units) of the response body returned for the selected log URL (post-range). */
    contentTotalBytes?: number;
    /** True when `content` was head-truncated by `maxBytesApplied`. */
    contentTruncated?: boolean;
    /** Echoed when the caller requested a line range. */
    contentStartLine?: number;
    contentEndLine?: number;
    excerpts: LogExcerpt[];
  };
  artifacts: ArtifactSummary[];
  summary: string;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function recordIssueMessages(record: TimelineRecord): string[] {
  return record.issues
    .map((issue) => issue.message?.trim())
    .filter((message): message is string => Boolean(message));
}

function toTimelineEvidence(record: TimelineRecord): TimelineRecordEvidence {
  return {
    id: record.id,
    ...(record.parentId !== undefined ? { parentId: record.parentId } : {}),
    ...(record.type !== undefined ? { type: record.type } : {}),
    ...(record.name !== undefined ? { name: record.name } : {}),
    ...(record.result !== undefined ? { result: record.result } : {}),
    ...(record.state !== undefined ? { state: record.state } : {}),
    ...(record.logId !== undefined ? { logId: record.logId } : {}),
    issueMessages: recordIssueMessages(record),
  };
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function detectMarker(line: string): { marker: string; priority: number } | undefined {
  for (const candidate of LOG_MARKERS) {
    if (candidate.test.test(line)) {
      return { marker: candidate.marker, priority: candidate.priority };
    }
  }
  return undefined;
}

export function extractLogExcerpts(
  logContent: string,
  options: { contextLines?: number; maxExcerpts?: number } = {},
): LogExcerpt[] {
  const contextLines = clampInteger(options.contextLines, 0, 10, DEFAULT_CONTEXT_LINES);
  const maxExcerpts = clampInteger(options.maxExcerpts, 1, 20, DEFAULT_MAX_EXCERPTS);

  const normalized = normalizeLineEndings(logContent);
  const lines = normalized.split("\n");

  const excerpts: LogExcerpt[] = [];
  let lastCapturedEnd = -1;
  let lastCapturedPriority = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const detected = detectMarker(line);
    if (!detected) continue;
    if (excerpts.length >= maxExcerpts) break;

    const start = Math.max(0, index - contextLines);
    const end = Math.min(lines.length - 1, index + contextLines);

    if (start <= lastCapturedEnd && detected.priority <= lastCapturedPriority) {
      continue;
    }

    excerpts.push({
      marker: detected.marker,
      lineNumber: index + 1,
      startLine: start + 1,
      endLine: end + 1,
      text: lines.slice(start, end + 1).join("\n").trimEnd(),
    });

    lastCapturedEnd = Math.max(lastCapturedEnd, end);
    lastCapturedPriority = detected.priority;
  }

  return excerpts;
}

function summarizeRecord(record: TimelineRecordEvidence): string {
  const type = record.type ?? "Record";
  const name = record.name ?? record.id;
  const result = record.result ? ` (${record.result})` : "";
  return `${type}: ${name}${result}`;
}

function buildHumanSummary(bundle: Omit<BuildFailureDiagnosticsBundle, "summary">): string {
  const statusText = [bundle.build?.status, bundle.build?.result].filter(Boolean).join("/") || "unknown";
  const failedTop = bundle.failedRecords[0] ? summarizeRecord(bundle.failedRecords[0]) : "none";
  const selectedLog = bundle.logs.selected.resolvedLogId
    ? `log ${bundle.logs.selected.resolvedLogId} (${bundle.logs.selected.resolvedLogSource ?? "unknown source"})`
    : "none";

  const matchedContext = [
    bundle.matchedStageRecord ? `stage ${bundle.matchedStageRecord.name ?? bundle.matchedStageRecord.id}` : undefined,
    bundle.matchedJobRecord ? `job ${bundle.matchedJobRecord.name ?? bundle.matchedJobRecord.id}` : undefined,
    bundle.matchedTaskRecord ? `task ${bundle.matchedTaskRecord.name ?? bundle.matchedTaskRecord.id}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    `Build ${bundle.buildId}: ${statusText}`,
    `Timeline failures: ${bundle.timelineSummary.failedRecords}, warnings: ${bundle.timelineSummary.warningCount}, problems: ${bundle.timelineSummary.problemCount}`,
    `Primary failed record: ${failedTop}`,
    matchedContext ? `Matched: ${matchedContext}` : undefined,
    `Selected log: ${selectedLog}`,
    `Log excerpts: ${bundle.logs.excerpts.length}`,
    `Artifacts: ${bundle.artifacts.length}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function collectBuildFailureDiagnostics(
  client: AzureDevOpsClient,
  input: BuildFailureDiagnosticsInput,
): Promise<BuildFailureDiagnosticsBundle> {
  const maxBytesApplied = clampInteger(input.maxBytes, 1, MAX_MAX_BYTES, DEFAULT_MAX_BYTES);

  const [build, timelineRecords, logs, artifacts] = await Promise.all([
    client.getBuild(input.buildId),
    client.getTimeline(input.buildId),
    client.listLogs(input.buildId),
    client.listArtifacts(input.buildId),
  ]);

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

  const selectedLog = selected.logId !== undefined ? logs.find((entry) => entry.id === selected.logId) : undefined;
  const logResult =
    selected.logId !== undefined
      ? await client.getLog(input.buildId, selected.logId, {
          maxBytes: maxBytesApplied,
          ...(input.startLine !== undefined ? { startLine: input.startLine } : {}),
          ...(input.endLine !== undefined ? { endLine: input.endLine } : {}),
        })
      : undefined;
  const content = logResult?.content;
  const excerpts = content ? extractLogExcerpts(content) : [];

  const failedRecords = timelineRecords
    .filter((record) => record.result?.toLowerCase() === "failed")
    .map(toTimelineEvidence);

  const canceledRecords = timelineRecords
    .filter((record) => record.result?.toLowerCase() === "canceled")
    .map(toTimelineEvidence);

  const issueMessages = timelineRecords
    .flatMap((record) => recordIssueMessages(record))
    .filter((message, index, all) => all.findIndex((candidate) => candidate === message) === index);

  const selectedDetails: SelectedLogInfo = buildSelectedLogInfo(lookups, selected);

  const bundleWithoutSummary: Omit<BuildFailureDiagnosticsBundle, "summary"> = {
    buildId: input.buildId,
    ...(build ? { build } : {}),
    timelineSummary: summarizeTimelineRecords(timelineRecords),
    failedRecords,
    canceledRecords,
    ...(lookups.matchedStageRecord ? { matchedStageRecord: toTimelineEvidence(lookups.matchedStageRecord) } : {}),
    ...(lookups.matchedJobRecord ? { matchedJobRecord: toTimelineEvidence(lookups.matchedJobRecord) } : {}),
    ...(lookups.matchedTaskRecord ? { matchedTaskRecord: toTimelineEvidence(lookups.matchedTaskRecord) } : {}),
    issueMessages,
    logs: {
      available: logs,
      selected: selectedDetails,
      ...(selectedLog ? { selectedLog } : {}),
      maxBytesApplied,
      ...(content !== undefined ? { content } : {}),
      ...(logResult !== undefined ? { contentTotalBytes: logResult.totalBytes } : {}),
      ...(logResult !== undefined ? { contentTruncated: logResult.truncated } : {}),
      ...(input.startLine !== undefined ? { contentStartLine: input.startLine } : {}),
      ...(input.endLine !== undefined ? { contentEndLine: input.endLine } : {}),
      excerpts,
    },
    artifacts,
  };

  return {
    ...bundleWithoutSummary,
    summary: buildHumanSummary(bundleWithoutSummary),
  };
}

export function redactDiagnosticsBundle<T>(bundle: T, additionalSensitiveValues: string[] = []): T {
  const redacted = redactSensitiveText(JSON.stringify(bundle), additionalSensitiveValues);
  return JSON.parse(redacted) as T;
}
