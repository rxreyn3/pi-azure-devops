import type {
  ArtifactKind,
  ArtifactSourceCandidate,
  ArtifactSourceResolution,
  ArtifactSummary,
  AzureDevOpsScope,
  BuildSummary,
  LogSelectionSource,
  LogSummary,
  PipelineSummary,
  ResolvedArtifactKind,
  RunSummary,
  SelectedLogInfo,
  TimelineIssue,
  TimelineNameMatchMode,
  TimelineRecord,
  TimelineRecordCandidate,
  TimelineRecordLookupResult,
  TimelineRecordRole,
  TimelineRecordSelector,
  TimelineSummary,
} from "./models.js";
import type { RestClient } from "./rest.js";
import { buildReadOnlyEndpoints } from "./endpoints.js";
import { RestRequestError } from "./errors.js";
import { DEFAULT_LOG_MAX_BYTES } from "./limits.js";

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

interface PipelineArtifactSignedContent {
  url?: string;
  signedExpiry?: string;
}

interface PipelineArtifactPayload {
  name: string;
  source?: string;
  signedContent?: PipelineArtifactSignedContent;
}

function normalizePipelineArtifact(payload: unknown): PipelineArtifactPayload | undefined {
  const obj = asObject(payload);
  if (!obj) return undefined;

  const name = normalizeIdentifier(obj.name);
  if (!name) return undefined;

  const result: PipelineArtifactPayload = { name };

  const source = normalizeIdentifier(obj.source);
  if (source) {
    result.source = source;
  }

  const signedContent = asObject(obj.signedContent);
  if (signedContent) {
    const signed: PipelineArtifactSignedContent = {};
    const url = normalizeIdentifier(signedContent.url);
    const signedExpiry = normalizeIdentifier(signedContent.signedExpiry);
    if (url) signed.url = url;
    if (signedExpiry) signed.signedExpiry = signedExpiry;
    if (Object.keys(signed).length > 0) {
      result.signedContent = signed;
    }
  }

  return result;
}

type ReadOnlyEndpoints = ReturnType<typeof buildReadOnlyEndpoints>;

async function tryGetBuild(
  rest: RestClient,
  endpoints: ReadOnlyEndpoints,
  buildId: number,
): Promise<BuildSummary | undefined> {
  try {
    const response = await rest.getJson<unknown>(endpoints.getBuild(buildId));
    return normalizeBuildSummary(response.data);
  } catch (error) {
    if (error instanceof RestRequestError && error.status === 404) return undefined;
    throw error;
  }
}

async function tryGetBuildArtifact(
  rest: RestClient,
  endpoints: ReadOnlyEndpoints,
  buildId: number,
  artifactName: string,
): Promise<ArtifactSummary | undefined> {
  try {
    const response = await rest.getJson<unknown>(endpoints.getBuildArtifact(buildId, artifactName));
    return normalizeArtifactSummary(response.data);
  } catch (error) {
    if (error instanceof RestRequestError && error.status === 404) return undefined;
    throw error;
  }
}

async function tryGetPipelineArtifact(
  rest: RestClient,
  endpoints: ReadOnlyEndpoints,
  pipelineId: number,
  runId: number,
  artifactName: string,
  expandSignedContent: boolean,
): Promise<PipelineArtifactPayload | undefined> {
  try {
    const response = await rest.getJson<unknown>(
      endpoints.getPipelineArtifact(pipelineId, runId, artifactName, expandSignedContent),
    );
    return normalizePipelineArtifact(response.data);
  } catch (error) {
    if (error instanceof RestRequestError && error.status === 404) return undefined;
    throw error;
  }
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

const ROLE_TIMELINE_TYPE: Record<TimelineRecordRole, string> = {
  stage: "Stage",
  job: "Job",
  task: "Task",
};

export function toTimelineRecordCandidate(record: TimelineRecord): TimelineRecordCandidate {
  const candidate: TimelineRecordCandidate = { id: record.id };
  setDefined(candidate, "parentId", record.parentId);
  setDefined(candidate, "type", record.type);
  setDefined(candidate, "name", record.name);
  setDefined(candidate, "result", record.result);
  setDefined(candidate, "state", record.state);
  setDefined(candidate, "logId", record.logId);
  return candidate;
}

function recordsForRole(records: TimelineRecord[], role: TimelineRecordRole): TimelineRecord[] {
  const expectedType = ROLE_TIMELINE_TYPE[role].toLowerCase();
  return records.filter((record) => record.type?.toLowerCase() === expectedType);
}

interface InternalLookupOutcome {
  lookup: TimelineRecordLookupResult;
  matched?: TimelineRecord;
}

function classifyNameMatches(
  candidates: TimelineRecord[],
  selector: TimelineRecordSelector,
  rawValue: string,
): InternalLookupOutcome | undefined {
  const lower = rawValue.toLowerCase();
  const tiers: Array<{ mode: TimelineNameMatchMode; matches: TimelineRecord[] }> = [
    { mode: "exact", matches: candidates.filter((record) => record.name === rawValue) },
    {
      mode: "caseInsensitiveExact",
      matches: candidates.filter((record) => record.name?.toLowerCase() === lower),
    },
    {
      mode: "substring",
      matches: candidates.filter((record) => record.name?.toLowerCase().includes(lower)),
    },
  ];

  for (const tier of tiers) {
    if (tier.matches.length === 1) {
      const matched = tier.matches[0]!;
      return {
        lookup: {
          status: "matched",
          selector,
          record: toTimelineRecordCandidate(matched),
          matchMode: tier.mode,
        },
        matched,
      };
    }
    if (tier.matches.length > 1) {
      return {
        lookup: {
          status: "ambiguous",
          selector,
          matchMode: tier.mode,
          candidates: tier.matches.map(toTimelineRecordCandidate),
        },
      };
    }
  }

  return undefined;
}

function lookupTimelineRecordInternal(
  records: TimelineRecord[],
  selector: TimelineRecordSelector,
): InternalLookupOutcome {
  const trimmed = selector.value.trim();
  if (!trimmed) {
    // Defensive branch: callers reaching this directly with a whitespace-only value
    // get a structured noMatch. Higher-level resolvers (resolveTimelineRecordLookups)
    // short-circuit empty/whitespace input to `notRequested` before getting here.
    return { lookup: { status: "noMatch", selector } };
  }

  if (selector.selectorKind === "id") {
    // ID selectors are role-agnostic by design: they preserve the prior `jobId`/`taskId`
    // case-insensitive ID-only behavior. A caller who passes a Task GUID via `jobId`
    // will match the Task record. Name selectors are role-scoped by `recordsForRole`.
    const target = trimmed.toLowerCase();
    const match = records.find((record) => record.id.toLowerCase() === target);
    if (!match) return { lookup: { status: "noMatch", selector } };
    return {
      lookup: { status: "matched", selector, record: toTimelineRecordCandidate(match) },
      matched: match,
    };
  }

  const roleCandidates = recordsForRole(records, selector.role);
  const classified = classifyNameMatches(roleCandidates, selector, trimmed);
  return classified ?? { lookup: { status: "noMatch", selector } };
}

export function lookupTimelineRecord(
  records: TimelineRecord[],
  selector: TimelineRecordSelector,
): TimelineRecordLookupResult {
  return lookupTimelineRecordInternal(records, selector).lookup;
}

export interface TimelineLookupSelectorInput {
  stageId?: string;
  stageName?: string;
  jobId?: string;
  jobName?: string;
  taskId?: string;
  taskName?: string;
}

export interface ResolvedTimelineRecordLookups {
  stageLookup: TimelineRecordLookupResult;
  jobLookup: TimelineRecordLookupResult;
  taskLookup: TimelineRecordLookupResult;
  matchedStageRecord?: TimelineRecord;
  matchedJobRecord?: TimelineRecord;
  matchedTaskRecord?: TimelineRecord;
  anySelectorRequested: boolean;
}

function buildSelector(
  role: TimelineRecordRole,
  idValue: string | undefined,
  nameValue: string | undefined,
): TimelineRecordSelector | undefined {
  const idTrimmed = idValue?.trim();
  if (idTrimmed) return { role, selectorKind: "id", value: idTrimmed };
  const nameTrimmed = nameValue?.trim();
  if (nameTrimmed) return { role, selectorKind: "name", value: nameTrimmed };
  return undefined;
}

function resolveLookupForRole(
  records: TimelineRecord[],
  role: TimelineRecordRole,
  idValue: string | undefined,
  nameValue: string | undefined,
): InternalLookupOutcome {
  const selector = buildSelector(role, idValue, nameValue);
  if (!selector) return { lookup: { status: "notRequested", role } };
  return lookupTimelineRecordInternal(records, selector);
}

export function resolveTimelineRecordLookups(
  records: TimelineRecord[],
  input: TimelineLookupSelectorInput,
): ResolvedTimelineRecordLookups {
  const stage = resolveLookupForRole(records, "stage", input.stageId, input.stageName);
  const job = resolveLookupForRole(records, "job", input.jobId, input.jobName);
  const task = resolveLookupForRole(records, "task", input.taskId, input.taskName);

  const anySelectorRequested =
    stage.lookup.status !== "notRequested" ||
    job.lookup.status !== "notRequested" ||
    task.lookup.status !== "notRequested";

  return {
    stageLookup: stage.lookup,
    jobLookup: job.lookup,
    taskLookup: task.lookup,
    ...(stage.matched ? { matchedStageRecord: stage.matched } : {}),
    ...(job.matched ? { matchedJobRecord: job.matched } : {}),
    ...(task.matched ? { matchedTaskRecord: task.matched } : {}),
    anySelectorRequested,
  };
}

export function buildSelectedLogInfo(
  lookups: ResolvedTimelineRecordLookups,
  selected: { logId?: number; source?: LogSelectionSource },
): SelectedLogInfo {
  const result: SelectedLogInfo = {};
  setDefined(result, "matchedStageRecordId", lookups.matchedStageRecord?.id);
  setDefined(result, "matchedJobRecordId", lookups.matchedJobRecord?.id);
  setDefined(result, "matchedTaskRecordId", lookups.matchedTaskRecord?.id);
  if (lookups.stageLookup.status !== "notRequested") result.stageLookup = lookups.stageLookup;
  if (lookups.jobLookup.status !== "notRequested") result.jobLookup = lookups.jobLookup;
  if (lookups.taskLookup.status !== "notRequested") result.taskLookup = lookups.taskLookup;
  setDefined(result, "resolvedLogId", selected.logId);
  setDefined(result, "resolvedLogSource", selected.source);
  return result;
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

export interface ResolveBuildLogSelectionInput {
  buildId: number;
  stageId?: string;
  stageName?: string;
  jobId?: string;
  jobName?: string;
  taskId?: string;
  taskName?: string;
  explicitLogId?: number;
}

export interface ResolveArtifactSourceInput {
  buildId: number;
  artifactName: string;
  artifactKind?: ArtifactKind;
  pipelineId?: number;
  runId?: number;
}

export interface DownloadArtifactZipInput {
  buildId: number;
  artifactName: string;
  resolvedArtifactKind: ResolvedArtifactKind;
  pipelineId?: number;
  runId?: number;
  maxBytes?: number;
}

export interface SanitizedArtifactDownloadMetadata {
  artifactName: string;
  resolvedArtifactKind: ResolvedArtifactKind;
  resourceType?: string;
  pipelineId?: number;
  runId?: number;
}

export interface DownloadArtifactZipResult {
  bytes: Uint8Array;
  metadata: SanitizedArtifactDownloadMetadata;
}

export interface GetLogOptions {
  /** Max characters returned to the caller (rest layer slices full body before returning). */
  maxBytes?: number;
  /** AzDO log line number to start at, inclusive (1-indexed). Bypasses head-only `maxBytes` truncation when paired with `endLine`. */
  startLine?: number;
  /** AzDO log line number to end at, inclusive (1-indexed). */
  endLine?: number;
}

export interface LogFetchResult {
  content: string;
  /** Length (in JS string code units) of the response body the server returned for this URL (post-range, pre-slice). */
  totalBytes: number;
  /** Length of `content` (post-slice). Equal to `totalBytes` when `truncated` is false. */
  returnedBytes: number;
  /** True when `content` was head-truncated by `maxBytes`. */
  truncated: boolean;
  /** Echoed when the caller requested a line range. */
  startLine?: number;
  endLine?: number;
}

export interface AzureDevOpsClient {
  listPipelines(top?: number): Promise<PipelineSummary[]>;
  listBuilds(top?: number): Promise<BuildSummary[]>;
  getBuild(buildId: number): Promise<BuildSummary | undefined>;
  getRun(pipelineId: number, runId: number): Promise<RunSummary | undefined>;
  getTimeline(buildId: number): Promise<TimelineRecord[]>;
  listLogs(buildId: number): Promise<LogSummary[]>;
  getLog(buildId: number, logId: number, opts?: GetLogOptions): Promise<LogFetchResult>;
  listArtifacts(buildId: number): Promise<ArtifactSummary[]>;
  resolveArtifactSource(input: ResolveArtifactSourceInput): Promise<ArtifactSourceResolution>;
  downloadArtifactZip(input: DownloadArtifactZipInput): Promise<DownloadArtifactZipResult>;
  resolveBuildLogSelection(input: ResolveBuildLogSelectionInput): Promise<SelectedLogInfo>;
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

    async getLog(buildId: number, logId: number, opts: GetLogOptions = {}): Promise<LogFetchResult> {
      const maxBytes = opts.maxBytes ?? DEFAULT_LOG_MAX_BYTES;
      const url = endpoints.getLog(buildId, logId, {
        ...(opts.startLine !== undefined ? { startLine: opts.startLine } : {}),
        ...(opts.endLine !== undefined ? { endLine: opts.endLine } : {}),
      });
      const response = await rest.getText(url, { maxBytes });
      return {
        content: response.data,
        totalBytes: response.totalBytes,
        returnedBytes: response.data.length,
        truncated: response.truncated,
        ...(opts.startLine !== undefined ? { startLine: opts.startLine } : {}),
        ...(opts.endLine !== undefined ? { endLine: opts.endLine } : {}),
      };
    },

    async listArtifacts(buildId: number): Promise<ArtifactSummary[]> {
      const response = await rest.getJson<unknown>(endpoints.listArtifacts(buildId));
      return extractValueArray(response.data).map(normalizeArtifactSummary).filter((x): x is ArtifactSummary => Boolean(x));
    },

    async resolveArtifactSource(input: ResolveArtifactSourceInput): Promise<ArtifactSourceResolution> {
      const artifactKind: ArtifactKind = input.artifactKind ?? "auto";
      const artifactName = input.artifactName;

      const buildArtifact = artifactKind !== "pipeline" ? await tryGetBuildArtifact(rest, endpoints, input.buildId, artifactName) : undefined;

      let pipelineId = input.pipelineId;
      let runId = input.runId;
      let pipelineSourceInferable = pipelineId !== undefined && runId !== undefined;

      if (artifactKind !== "build" && !pipelineSourceInferable) {
        const inferredBuild = await tryGetBuild(rest, endpoints, input.buildId);
        if (pipelineId === undefined && inferredBuild?.definitionId !== undefined) {
          pipelineId = inferredBuild.definitionId;
        }
        if (runId === undefined) {
          runId = input.buildId;
        }
        pipelineSourceInferable = pipelineId !== undefined && runId !== undefined;
      }

      let pipelineArtifact: PipelineArtifactPayload | undefined;
      let pipelineLookupError: Error | undefined;
      if (artifactKind !== "build" && pipelineSourceInferable && pipelineId !== undefined && runId !== undefined) {
        try {
          pipelineArtifact = await tryGetPipelineArtifact(rest, endpoints, pipelineId, runId, artifactName, false);
        } catch (error) {
          if (artifactKind === "auto") {
            // In auto mode, isolate non-404 pipeline-side failures so a successful
            // build candidate (or a clean "not found in either") can still be
            // returned. The error is surfaced via resolution metadata; if no
            // build candidate is available we re-raise below so the caller is
            // not blind to a transient pipeline outage.
            pipelineLookupError = error instanceof Error ? error : new Error(String(error));
          } else {
            throw error;
          }
        }
      }

      if (artifactKind === "build") {
        if (!buildArtifact) {
          return {
            status: "notFound",
            artifactKind,
            artifactName,
            message: `Build artifact "${artifactName}" not found for build ${input.buildId}.`,
          };
        }
        const candidate: ArtifactSourceCandidate = { kind: "build", artifactName };
        if (buildArtifact.resourceType !== undefined) candidate.resourceType = buildArtifact.resourceType;
        return { status: "resolved", artifactKind, resolved: candidate };
      }

      if (artifactKind === "pipeline") {
        if (!pipelineSourceInferable) {
          return {
            status: "pipelineSourceUnresolved",
            artifactKind,
            artifactName,
            message: `Pipeline artifact source could not be resolved for build ${input.buildId}. Provide explicit pipelineId and runId.`,
          };
        }
        if (!pipelineArtifact) {
          return {
            status: "notFound",
            artifactKind,
            artifactName,
            message: `Pipeline artifact "${artifactName}" not found for pipeline ${pipelineId}, run ${runId}.`,
          };
        }
        const candidate: ArtifactSourceCandidate = { kind: "pipeline", artifactName };
        if (pipelineId !== undefined) candidate.pipelineId = pipelineId;
        if (runId !== undefined) candidate.runId = runId;
        return { status: "resolved", artifactKind, resolved: candidate };
      }

      const candidates: ArtifactSourceCandidate[] = [];
      if (buildArtifact) {
        const candidate: ArtifactSourceCandidate = { kind: "build", artifactName };
        if (buildArtifact.resourceType !== undefined) candidate.resourceType = buildArtifact.resourceType;
        candidates.push(candidate);
      }
      if (pipelineArtifact && pipelineId !== undefined && runId !== undefined) {
        candidates.push({ kind: "pipeline", artifactName, pipelineId, runId });
      }

      if (candidates.length === 0) {
        if (pipelineLookupError) {
          // Auto-mode: pipeline lookup errored AND no build candidate to fall back
          // on. Re-raise so the caller is not silently led to a misleading
          // "notFound" outcome from a transient pipeline-side failure.
          throw pipelineLookupError;
        }
        return {
          status: "notFound",
          artifactKind,
          artifactName,
          message: `Artifact "${artifactName}" not found via Build Artifacts or Pipelines Artifacts APIs for build ${input.buildId}.`,
        };
      }
      if (candidates.length > 1) {
        return {
          status: "ambiguous",
          artifactKind,
          candidates,
          message: `Artifact "${artifactName}" exists in both Build Artifacts and Pipelines Artifacts. Set artifactKind explicitly (build|pipeline) to disambiguate.`,
        };
      }
      const resolution: ArtifactSourceResolution = {
        status: "resolved",
        artifactKind,
        resolved: candidates[0]!,
      };
      if (pipelineLookupError) {
        resolution.notes = [
          `Pipeline Artifacts lookup errored during auto resolution (using build candidate): ${pipelineLookupError.message}`,
        ];
      }
      return resolution;
    },

    async downloadArtifactZip(input: DownloadArtifactZipInput): Promise<DownloadArtifactZipResult> {
      if (input.resolvedArtifactKind === "build") {
        const url = endpoints.getBuildArtifact(input.buildId, input.artifactName);
        const metadataResponse = await rest.getJson<unknown>(url);
        const buildArtifact = normalizeArtifactSummary(metadataResponse.data);
        const downloadUrl = buildArtifact?.downloadUrl;
        if (!downloadUrl) {
          throw new Error(`Build artifact "${input.artifactName}" did not return a downloadUrl.`);
        }
        const binary = await rest.getBinary(downloadUrl, {
          ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
          additionalSensitiveValues: [downloadUrl],
          auth: "azureDevOps",
        });
        const metadata: SanitizedArtifactDownloadMetadata = {
          artifactName: input.artifactName,
          resolvedArtifactKind: "build",
        };
        if (buildArtifact?.resourceType !== undefined) metadata.resourceType = buildArtifact.resourceType;
        return { bytes: binary.data, metadata };
      }

      const pipelineId = input.pipelineId;
      const runId = input.runId;
      if (pipelineId === undefined || runId === undefined) {
        throw new Error(`Pipeline artifact download requires pipelineId and runId.`);
      }
      const metadataUrl = endpoints.getPipelineArtifact(pipelineId, runId, input.artifactName, true);
      const metadataResponse = await rest.getJson<unknown>(metadataUrl);
      const pipelineArtifact = normalizePipelineArtifact(metadataResponse.data);
      const signedUrl = pipelineArtifact?.signedContent?.url;
      if (!signedUrl) {
        throw new Error(`Pipeline artifact "${input.artifactName}" did not return a signedContent URL.`);
      }
      const binary = await rest.getBinary(signedUrl, {
        ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
        additionalSensitiveValues: [signedUrl],
        auth: "none",
      });
      const metadata: SanitizedArtifactDownloadMetadata = {
        artifactName: input.artifactName,
        resolvedArtifactKind: "pipeline",
        pipelineId,
        runId,
      };
      return { bytes: binary.data, metadata };
    },

    async resolveBuildLogSelection(input: ResolveBuildLogSelectionInput): Promise<SelectedLogInfo> {
      const timeline = await this.getTimeline(input.buildId);
      const logs = await this.listLogs(input.buildId);

      const lookups = resolveTimelineRecordLookups(timeline, {
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
        explicitLogId: input.explicitLogId,
        logs: lookups.anySelectorRequested ? undefined : logs,
      });

      return buildSelectedLogInfo(lookups, selected);
    },
  };
}
