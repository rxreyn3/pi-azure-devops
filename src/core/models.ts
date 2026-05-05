export type OperationStatus = "mocked" | "verified" | "skipped" | "failed";

export type LogSelectionSource = "timelineTask" | "timelineJob" | "explicit" | "logsListFirst";

export interface AzureDevOpsScope {
  organization: string;
  organizationUrl: string;
  project: string;
}

export interface PipelineSummary {
  id: number;
  name?: string;
  folder?: string;
  url?: string;
}

export interface BuildSummary {
  id: number;
  buildNumber?: string;
  status?: string;
  result?: string;
  definitionId?: number;
  definitionName?: string;
  sourceBranch?: string;
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
}

export interface RunSummary {
  id: number;
  name?: string;
  state?: string;
  result?: string;
  pipelineId?: number;
  pipelineName?: string;
  createdDate?: string;
  finishedDate?: string;
}

export interface TimelineIssue {
  type?: string;
  message?: string;
}

export interface TimelineRecord {
  id: string;
  parentId?: string;
  type?: string;
  name?: string;
  result?: string;
  state?: string;
  logId?: number;
  issues: TimelineIssue[];
}

export interface TimelineSummary {
  totalRecords: number;
  failedRecords: number;
  warningCount: number;
  problemCount: number;
}

export interface LogSummary {
  id: number;
  type?: string;
  lineCount?: number;
  createdOn?: string;
}

export interface ArtifactSummary {
  id?: number;
  name?: string;
  resourceType?: string;
  downloadUrl?: string;
}

export type ArtifactKind = "auto" | "build" | "pipeline";

export type ResolvedArtifactKind = "build" | "pipeline";

export interface ArtifactSourceCandidate {
  kind: ResolvedArtifactKind;
  artifactName: string;
  resourceType?: string;
  pipelineId?: number;
  runId?: number;
}

export type ArtifactSourceResolution =
  | {
      status: "resolved";
      artifactKind: ArtifactKind;
      resolved: ArtifactSourceCandidate;
      notes?: string[];
    }
  | {
      status: "ambiguous";
      artifactKind: ArtifactKind;
      candidates: ArtifactSourceCandidate[];
      message: string;
    }
  | {
      status: "notFound";
      artifactKind: ArtifactKind;
      artifactName: string;
      message: string;
    }
  | {
      status: "pipelineSourceUnresolved";
      artifactKind: ArtifactKind;
      artifactName: string;
      message: string;
    };

export interface ArtifactDownloadInput {
  buildId: number;
  artifactName: string;
  outputPath: string;
  cwd: string;
  confirm?: boolean;
  extract?: boolean;
  overwrite?: boolean;
  maxBytes?: number;
  artifactKind?: ArtifactKind;
  pipelineId?: number;
  runId?: number;
}

export interface ArtifactDownloadPreview {
  status: "preview";
  buildId: number;
  artifactName: string;
  artifactKind: ArtifactKind;
  resolvedArtifactKind?: ResolvedArtifactKind;
  pipelineId?: number;
  runId?: number;
  outputPath: string;
  resolvedOutputPath: string;
  extract: boolean;
  overwrite: boolean;
  maxBytes: number;
  wouldWrite: string[];
  requiresConfirmation: true;
  resolution: ArtifactSourceResolution;
  notes: string[];
}

export interface ArtifactDownloadResult {
  status: "downloaded" | "extracted";
  buildId: number;
  artifactName: string;
  artifactKind: ArtifactKind;
  resolvedArtifactKind: ResolvedArtifactKind;
  pipelineId?: number;
  runId?: number;
  outputPath: string;
  resolvedOutputPath: string;
  extract: boolean;
  overwrite: boolean;
  maxBytes: number;
  bytesDownloaded: number;
  writtenFiles: string[];
  resolution: Extract<ArtifactSourceResolution, { status: "resolved" }>;
  notes?: string[];
}

export type TimelineRecordRole = "stage" | "job" | "task";

export type TimelineNameMatchMode = "exact" | "caseInsensitiveExact" | "substring";

export type TimelineRecordSelector =
  | { role: TimelineRecordRole; selectorKind: "id"; value: string }
  | { role: TimelineRecordRole; selectorKind: "name"; value: string };

export interface TimelineRecordCandidate {
  id: string;
  parentId?: string;
  type?: string;
  name?: string;
  result?: string;
  state?: string;
  logId?: number;
}

export type TimelineRecordLookupResult =
  | { status: "notRequested"; role: TimelineRecordRole }
  | {
      status: "matched";
      selector: TimelineRecordSelector;
      record: TimelineRecordCandidate;
      matchMode?: TimelineNameMatchMode;
    }
  | { status: "noMatch"; selector: TimelineRecordSelector }
  | {
      status: "ambiguous";
      selector: TimelineRecordSelector;
      matchMode: TimelineNameMatchMode;
      candidates: TimelineRecordCandidate[];
    };

export interface SelectedLogInfo {
  resolvedLogId?: number;
  resolvedLogSource?: LogSelectionSource;
  matchedStageRecordId?: string;
  matchedJobRecordId?: string;
  matchedTaskRecordId?: string;
  stageLookup?: TimelineRecordLookupResult;
  jobLookup?: TimelineRecordLookupResult;
  taskLookup?: TimelineRecordLookupResult;
}

export interface DoctorResult {
  config: {
    organization?: string;
    project?: string;
    profile?: string;
    sources: {
      organization?: string;
      project?: string;
      profile?: string;
    };
    configFilesChecked: string[];
  };
  auth: {
    tokenFound: boolean;
    tokenSource?: string;
  };
  warnings: string[];
}
