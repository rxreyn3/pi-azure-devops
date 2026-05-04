import type {
  ArtifactSummary,
  AzureDevOpsScope,
  BuildSummary,
  LogSelectionSource,
  LogSummary,
  PipelineSummary,
  RunSummary,
  SelectedLogInfo,
  TimelineIssue,
  TimelineRecord,
  TimelineSummary,
} from "./models.js";
import type { RestClient } from "./rest.js";
import { buildReadOnlyEndpoints } from "./endpoints.js";

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function normalizeIdentifier(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function extractValueArray(payload: unknown): unknown[] {
  const obj = asObject(payload);
  const value = obj?.value;
  return Array.isArray(value) ? value : [];
}

function setDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function normalizePipelineSummary(payload: unknown): PipelineSummary | undefined {
  const obj = asObject(payload);
  const id = asPositiveNumber(obj?.id);
  if (!id) return undefined;

  const result: PipelineSummary = { id };
  setDefined(result, "name", normalizeIdentifier(obj?.name));
  setDefined(result, "folder", normalizeIdentifier(obj?.folder));
  setDefined(result, "url", normalizeIdentifier(obj?.url));
  return result;
}

function normalizeBuildSummary(payload: unknown): BuildSummary | undefined {
  const obj = asObject(payload);
  const id = asPositiveNumber(obj?.id);
  if (!id) return undefined;

  const definition = asObject(obj?.definition);
  const result: BuildSummary = { id };

  setDefined(result, "buildNumber", normalizeIdentifier(obj?.buildNumber));
  setDefined(result, "status", normalizeIdentifier(obj?.status));
  setDefined(result, "result", normalizeIdentifier(obj?.result));
  setDefined(result, "definitionId", asPositiveNumber(definition?.id));
  setDefined(result, "definitionName", normalizeIdentifier(definition?.name));
  setDefined(result, "sourceBranch", normalizeIdentifier(obj?.sourceBranch));
  setDefined(result, "queueTime", normalizeIdentifier(obj?.queueTime));
  setDefined(result, "startTime", normalizeIdentifier(obj?.startTime));
  setDefined(result, "finishTime", normalizeIdentifier(obj?.finishTime));

  return result;
}

function normalizeRunSummary(payload: unknown): RunSummary | undefined {
  const obj = asObject(payload);
  const id = asPositiveNumber(obj?.id);
  if (!id) return undefined;

  const pipeline = asObject(obj?.pipeline);
  const result: RunSummary = { id };

  setDefined(result, "name", normalizeIdentifier(obj?.name));
  setDefined(result, "state", normalizeIdentifier(obj?.state));
  setDefined(result, "result", normalizeIdentifier(obj?.result));
  setDefined(result, "pipelineId", asPositiveNumber(pipeline?.id));
  setDefined(result, "pipelineName", normalizeIdentifier(pipeline?.name));
  setDefined(result, "createdDate", normalizeIdentifier(obj?.createdDate));
  setDefined(result, "finishedDate", normalizeIdentifier(obj?.finishedDate));

  return result;
}

function normalizeLogSummary(payload: unknown): LogSummary | undefined {
  const obj = asObject(payload);
  const id = asPositiveNumber(obj?.id);
  if (!id) return undefined;

  const result: LogSummary = { id };
  setDefined(result, "type", normalizeIdentifier(obj?.type));
  setDefined(result, "lineCount", asPositiveNumber(obj?.lineCount));
  setDefined(result, "createdOn", normalizeIdentifier(obj?.createdOn));

  return result;
}

function normalizeArtifactSummary(payload: unknown): ArtifactSummary | undefined {
  const obj = asObject(payload);
  if (!obj) return undefined;

  const resource = asObject(obj.resource);
  const result: ArtifactSummary = {};

  setDefined(result, "id", asPositiveNumber(obj.id));
  setDefined(result, "name", normalizeIdentifier(obj.name));
  setDefined(result, "resourceType", normalizeIdentifier(resource?.type));
  setDefined(result, "downloadUrl", normalizeIdentifier(resource?.downloadUrl));

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeTimelineIssues(rawIssues: unknown[]): TimelineIssue[] {
  const issues: TimelineIssue[] = [];

  for (const rawIssue of rawIssues) {
    const issue = asObject(rawIssue);
    if (!issue) continue;

    const normalized: TimelineIssue = {};
    setDefined(normalized, "type", normalizeIdentifier(issue.type));
    setDefined(normalized, "message", normalizeIdentifier(issue.message));

    issues.push(normalized);
  }

  return issues;
}

export function extractTimelineRecords(payload: unknown): TimelineRecord[] {
  const obj = asObject(payload);
  if (!obj) return [];

  const candidates: unknown[] = [];
  if (Array.isArray(obj.records)) {
    candidates.push(...obj.records);
  }
  if (Array.isArray(obj.value)) {
    candidates.push(...obj.value);
  }

  const records: TimelineRecord[] = [];
  const seen = new Set<string>();

  for (const item of candidates) {
    const record = asObject(item);
    if (!record) continue;

    const id = normalizeIdentifier(record.id);
    if (!id) continue;

    const dedupeKey = id.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const log = asObject(record.log);

    const normalized: TimelineRecord = {
      id,
      issues: normalizeTimelineIssues(Array.isArray(record.issues) ? record.issues : []),
    };

    setDefined(normalized, "parentId", normalizeIdentifier(record.parentId));
    setDefined(normalized, "type", normalizeIdentifier(record.type));
    setDefined(normalized, "name", normalizeIdentifier(record.name));
    setDefined(normalized, "result", normalizeIdentifier(record.result));
    setDefined(normalized, "state", normalizeIdentifier(record.state));
    setDefined(normalized, "logId", asPositiveNumber(log?.id));

    records.push(normalized);
  }

  return records;
}

export function findTimelineRecordById(records: TimelineRecord[], targetId?: string): TimelineRecord | undefined {
  if (!targetId) return undefined;
  const normalizedTarget = targetId.trim().toLowerCase();
  if (!normalizedTarget) return undefined;

  return records.find((record) => record.id.toLowerCase() === normalizedTarget);
}

export function summarizeTimelineRecords(records: TimelineRecord[]): TimelineSummary {
  let failedRecords = 0;
  let warningCount = 0;
  let problemCount = 0;

  for (const record of records) {
    if (record.result?.toLowerCase() === "failed") {
      failedRecords += 1;
    }

    for (const issue of record.issues) {
      const issueType = issue.type?.toLowerCase();
      if (!issueType) continue;
      if (issueType === "warning") {
        warningCount += 1;
        problemCount += 1;
      } else if (issueType === "error" || issueType === "problem") {
        problemCount += 1;
      }
    }
  }

  return {
    totalRecords: records.length,
    failedRecords,
    warningCount,
    problemCount,
  };
}

export function selectLogId(input: {
  taskRecord: TimelineRecord | undefined;
  jobRecord: TimelineRecord | undefined;
  explicitLogId: number | undefined;
  logs: LogSummary[] | undefined;
}): { logId?: number; source?: LogSelectionSource } {
  if (input.taskRecord?.logId) {
    return { logId: input.taskRecord.logId, source: "timelineTask" };
  }
  if (input.jobRecord?.logId) {
    return { logId: input.jobRecord.logId, source: "timelineJob" };
  }
  if (input.explicitLogId) {
    return { logId: input.explicitLogId, source: "explicit" };
  }

  const firstLogId = input.logs?.[0]?.id;
  if (firstLogId) {
    return { logId: firstLogId, source: "logsListFirst" };
  }

  return {};
}

export interface AzureDevOpsClient {
  listPipelines(top?: number): Promise<PipelineSummary[]>;
  listBuilds(top?: number): Promise<BuildSummary[]>;
  getBuild(buildId: number): Promise<BuildSummary | undefined>;
  getRun(pipelineId: number, runId: number): Promise<RunSummary | undefined>;
  getTimeline(buildId: number): Promise<TimelineRecord[]>;
  listLogs(buildId: number): Promise<LogSummary[]>;
  getLog(buildId: number, logId: number, maxBytes?: number): Promise<string>;
  listArtifacts(buildId: number): Promise<ArtifactSummary[]>;
  resolveBuildLogSelection(input: {
    buildId: number;
    jobId?: string;
    taskId?: string;
    explicitLogId?: number;
  }): Promise<SelectedLogInfo>;
}

export function createAzureDevOpsClient(scope: AzureDevOpsScope, rest: RestClient): AzureDevOpsClient {
  const endpoints = buildReadOnlyEndpoints(scope);

  return {
    async listPipelines(top = 3): Promise<PipelineSummary[]> {
      const response = await rest.getJson<unknown>(endpoints.listPipelines(top));
      return extractValueArray(response.data).map(normalizePipelineSummary).filter((x): x is PipelineSummary => Boolean(x));
    },

    async listBuilds(top = 3): Promise<BuildSummary[]> {
      const response = await rest.getJson<unknown>(endpoints.listBuilds(top));
      return extractValueArray(response.data).map(normalizeBuildSummary).filter((x): x is BuildSummary => Boolean(x));
    },

    async getBuild(buildId: number): Promise<BuildSummary | undefined> {
      const response = await rest.getJson<unknown>(endpoints.getBuild(buildId));
      return normalizeBuildSummary(response.data);
    },

    async getRun(pipelineId: number, runId: number): Promise<RunSummary | undefined> {
      const response = await rest.getJson<unknown>(endpoints.getRun(pipelineId, runId));
      return normalizeRunSummary(response.data);
    },

    async getTimeline(buildId: number): Promise<TimelineRecord[]> {
      const response = await rest.getJson<unknown>(endpoints.getTimeline(buildId));
      return extractTimelineRecords(response.data);
    },

    async listLogs(buildId: number): Promise<LogSummary[]> {
      const response = await rest.getJson<unknown>(endpoints.listLogs(buildId));
      return extractValueArray(response.data).map(normalizeLogSummary).filter((x): x is LogSummary => Boolean(x));
    },

    async getLog(buildId: number, logId: number, maxBytes = 8_000): Promise<string> {
      const response = await rest.getText(endpoints.getLog(buildId, logId), { maxBytes });
      return response.data;
    },

    async listArtifacts(buildId: number): Promise<ArtifactSummary[]> {
      const response = await rest.getJson<unknown>(endpoints.listArtifacts(buildId));
      return extractValueArray(response.data).map(normalizeArtifactSummary).filter((x): x is ArtifactSummary => Boolean(x));
    },

    async resolveBuildLogSelection(input: {
      buildId: number;
      jobId?: string;
      taskId?: string;
      explicitLogId?: number;
    }): Promise<SelectedLogInfo> {
      const timeline = await this.getTimeline(input.buildId);
      const logs = await this.listLogs(input.buildId);

      const matchedJob = findTimelineRecordById(timeline, input.jobId);
      const matchedTask = findTimelineRecordById(timeline, input.taskId);
      const selected = selectLogId({
        taskRecord: matchedTask,
        jobRecord: matchedJob,
        explicitLogId: input.explicitLogId,
        logs,
      });

      const result: SelectedLogInfo = {};
      setDefined(result, "matchedJobRecordId", matchedJob?.id);
      setDefined(result, "matchedTaskRecordId", matchedTask?.id);
      setDefined(result, "resolvedLogId", selected.logId);
      setDefined(result, "resolvedLogSource", selected.source);
      return result;
    },
  };
}
