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

export interface SelectedLogInfo {
  resolvedLogId?: number;
  resolvedLogSource?: LogSelectionSource;
  matchedJobRecordId?: string;
  matchedTaskRecordId?: string;
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
