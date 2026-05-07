import {
  diagnoseFailureInputSchema,
  doctorInputSchema,
  downloadArtifactInputSchema,
  getLogsInputSchema,
  getStatusInputSchema,
  listArtifactsInputSchema,
  listBuildsInputSchema,
  listPipelinesInputSchema,
} from "./schemas.js";
import {
  runDiagnoseFailureOperation,
  runDoctorOperation,
  runDownloadArtifactOperation,
  runGetLogsOperation,
  runGetStatusOperation,
  runListArtifactsOperation,
  runListBuildsOperation,
  runListPipelinesOperation,
  type DiagnoseFailureDetails,
  type DiagnoseFailureInput,
  type DoctorDetails,
  type DoctorInput,
  type DownloadArtifactDetails,
  type DownloadArtifactInput,
  type GetLogsDetails,
  type GetLogsInput,
  type GetStatusDetails,
  type GetStatusInput,
  type ListArtifactsDetails,
  type ListArtifactsInput,
  type ListBuildsDetails,
  type ListBuildsInput,
  type ListPipelinesDetails,
  type ListPipelinesInput,
} from "./runners.js";
import type { AnyAzureDevOpsOperation, AzureDevOpsOperation, CliFlagSpec } from "./types.js";

const commonScopeFlags: readonly CliFlagSpec[] = [
  { kind: "string", flag: "organization", key: "organization" },
  { kind: "string", flag: "project", key: "project" },
  { kind: "string", flag: "profile", key: "profile" },
  { kind: "boolean", flag: "mock", key: "mock" },
  { kind: "boolean", flag: "json", key: "_json" },
];

const buildIdFlag: CliFlagSpec = {
  kind: "integer",
  flag: "build-id",
  key: "buildId",
  required: true,
};

const selectorFlags: readonly CliFlagSpec[] = [
  { kind: "string", flag: "stage-id", key: "stageId" },
  { kind: "string", flag: "stage-name", key: "stageName" },
  { kind: "string", flag: "job-id", key: "jobId" },
  { kind: "string", flag: "job-name", key: "jobName" },
  { kind: "string", flag: "task-id", key: "taskId" },
  { kind: "string", flag: "task-name", key: "taskName" },
];

const logRangeFlags: readonly CliFlagSpec[] = [
  { kind: "integer", flag: "log-id", key: "logId" },
  { kind: "integer", flag: "max-bytes", key: "maxBytes" },
  { kind: "integer", flag: "start-line", key: "startLine" },
  { kind: "integer", flag: "end-line", key: "endLine" },
];

export const doctorOperation: AzureDevOpsOperation<DoctorInput, DoctorDetails> = {
  key: "doctor",
  safety: "read-only",
  tool: {
    name: "azure_devops_doctor",
    label: "Azure DevOps Doctor",
    description: "Resolve Azure DevOps configuration/auth readiness (read-only).",
  },
  cli: {
    command: "doctor",
    usage: "pi-ado doctor [--json] [--mock] [--organization <org>] [--project <project>]",
    flags: commonScopeFlags,
  },
  inputSchema: doctorInputSchema,
  run: runDoctorOperation,
};

export const getStatusOperation: AzureDevOpsOperation<GetStatusInput, GetStatusDetails> = {
  key: "getStatus",
  safety: "read-only",
  tool: {
    name: "azure_devops_get_status",
    label: "Azure DevOps Get Status",
    description: "Get build status with timeline summary and selected log mapping (read-only).",
  },
  cli: {
    command: "status",
    usage:
      "pi-ado status --build-id <id> [--stage-id <guid>] [--stage-name <name>] [--job-id <guid>] [--job-name <name>] [--task-id <guid>] [--task-name <name>] [--json] [--mock]",
    flags: [...commonScopeFlags, buildIdFlag, ...selectorFlags],
  },
  inputSchema: getStatusInputSchema,
  run: runGetStatusOperation,
};

export const getLogsOperation: AzureDevOpsOperation<GetLogsInput, GetLogsDetails> = {
  key: "getLogs",
  safety: "read-only",
  tool: {
    name: "azure_devops_get_logs",
    label: "Azure DevOps Get Logs",
    description: "List build logs and return bounded selected log content (read-only).",
  },
  cli: {
    command: "logs",
    usage:
      "pi-ado logs --build-id <id> [--stage-id <guid>] [--stage-name <name>] [--job-id <guid>] [--job-name <name>] [--task-id <guid>] [--task-name <name>] [--log-id <id>] [--max-bytes <n>] [--start-line <n>] [--end-line <n>] [--json] [--mock]",
    flags: [...commonScopeFlags, buildIdFlag, ...selectorFlags, ...logRangeFlags],
  },
  inputSchema: getLogsInputSchema,
  run: runGetLogsOperation,
};

export const diagnoseFailureOperation: AzureDevOpsOperation<DiagnoseFailureInput, DiagnoseFailureDetails> = {
  key: "diagnoseFailure",
  safety: "read-only",
  tool: {
    name: "azure_devops_diagnose_failure",
    label: "Azure DevOps Diagnose Failure",
    description:
      "Collect read-only build failure evidence (status, timeline, logs, artifacts metadata).",
  },
  cli: {
    command: "diagnose",
    usage:
      "pi-ado diagnose --build-id <id> [--stage-id <guid>] [--stage-name <name>] [--job-id <guid>] [--job-name <name>] [--task-id <guid>] [--task-name <name>] [--log-id <id>] [--max-bytes <n>] [--start-line <n>] [--end-line <n>] [--json] [--mock]",
    flags: [...commonScopeFlags, buildIdFlag, ...selectorFlags, ...logRangeFlags],
  },
  inputSchema: diagnoseFailureInputSchema,
  run: runDiagnoseFailureOperation,
};

export const listArtifactsOperation: AzureDevOpsOperation<ListArtifactsInput, ListArtifactsDetails> = {
  key: "listArtifacts",
  safety: "read-only",
  tool: {
    name: "azure_devops_list_artifacts",
    label: "Azure DevOps List Artifacts",
    description: "List build artifact metadata only. No download/write/extract is performed.",
  },
  cli: {
    command: "artifacts",
    usage: "pi-ado artifacts --build-id <id> [--json] [--mock]",
    flags: [...commonScopeFlags, buildIdFlag],
  },
  inputSchema: listArtifactsInputSchema,
  run: runListArtifactsOperation,
};

export const listPipelinesOperation: AzureDevOpsOperation<ListPipelinesInput, ListPipelinesDetails> = {
  key: "listPipelines",
  safety: "read-only",
  tool: {
    name: "azure_devops_list_pipelines",
    label: "Azure DevOps List Pipelines",
    description: "List pipeline summaries (read-only).",
  },
  cli: {
    // Not exposed via CLI today; keep stable key but use empty command marker.
    command: "",
    usage: "",
    flags: [],
  },
  inputSchema: listPipelinesInputSchema,
  run: runListPipelinesOperation,
};

export const listBuildsOperation: AzureDevOpsOperation<ListBuildsInput, ListBuildsDetails> = {
  key: "listBuilds",
  safety: "read-only",
  tool: {
    name: "azure_devops_list_builds",
    label: "Azure DevOps List Builds",
    description: "List recent build summaries (read-only).",
  },
  cli: {
    command: "",
    usage: "",
    flags: [],
  },
  inputSchema: listBuildsInputSchema,
  run: runListBuildsOperation,
};

export const downloadArtifactOperation: AzureDevOpsOperation<DownloadArtifactInput, DownloadArtifactDetails> = {
  key: "downloadArtifact",
  safety: "local-write",
  tool: {
    name: "azure_devops_download_artifact",
    label: "Azure DevOps Download Artifact",
    description:
      "Download a build/pipeline artifact ZIP. Preview-first: writes a local file only when confirm=true. Signed URLs are redacted from output.",
  },
  cli: {
    command: "artifacts download",
    usage:
      "pi-ado artifacts download --build-id <id> --artifact-name <name> --output <path> --confirm [--extract] [--overwrite] [--max-bytes <n>] [--artifact-kind auto|build|pipeline] [--pipeline-id <id>] [--run-id <id>] [--json] [--mock]",
    flags: [
      ...commonScopeFlags,
      buildIdFlag,
      { kind: "string", flag: "artifact-name", key: "artifactName", required: true },
      { kind: "string", flag: "output", key: "outputPath", required: true },
      { kind: "boolean", flag: "confirm", key: "confirm" },
      { kind: "boolean", flag: "extract", key: "extract" },
      { kind: "boolean", flag: "overwrite", key: "overwrite" },
      { kind: "integer", flag: "max-bytes", key: "maxBytes" },
      {
        kind: "enum",
        flag: "artifact-kind",
        key: "artifactKind",
        values: ["auto", "build", "pipeline"] as const,
        defaultValue: "auto",
      },
      { kind: "integer", flag: "pipeline-id", key: "pipelineId" },
      { kind: "integer", flag: "run-id", key: "runId" },
    ],
  },
  inputSchema: downloadArtifactInputSchema,
  run: runDownloadArtifactOperation,
};

export const AZURE_DEVOPS_OPERATIONS: readonly AnyAzureDevOpsOperation[] = [
  doctorOperation,
  getStatusOperation,
  getLogsOperation,
  diagnoseFailureOperation,
  listArtifactsOperation,
  listPipelinesOperation,
  listBuildsOperation,
  downloadArtifactOperation,
];

export const READ_ONLY_AZURE_DEVOPS_OPERATIONS: readonly AnyAzureDevOpsOperation[] =
  AZURE_DEVOPS_OPERATIONS.filter((operation) => operation.safety === "read-only");

export const LOCAL_WRITE_AZURE_DEVOPS_OPERATIONS: readonly AnyAzureDevOpsOperation[] =
  AZURE_DEVOPS_OPERATIONS.filter((operation) => operation.safety === "local-write");

export function findOperationByCliCommand(command: string): AnyAzureDevOpsOperation | undefined {
  if (!command) return undefined;
  return AZURE_DEVOPS_OPERATIONS.find((operation) => operation.cli.command === command);
}
