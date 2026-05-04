import { defineTool } from "@mariozechner/pi-coding-agent";

import {
  diagnoseFailureToolSchema,
  doctorToolSchema,
  getLogsToolSchema,
  getStatusToolSchema,
  listArtifactsToolSchema,
  listBuildsToolSchema,
  listPipelinesToolSchema,
} from "../schemas.js";
import {
  runDiagnoseFailureTool,
  runDoctorTool,
  runGetLogsTool,
  runGetStatusTool,
  runListArtifactsTool,
  runListBuildsTool,
  runListPipelinesTool,
  type DiagnoseFailureToolInput,
  type DoctorToolInput,
  type GetLogsToolInput,
  type GetStatusToolInput,
  type ListArtifactsToolInput,
  type ListBuildsToolInput,
  type ListPipelinesToolInput,
} from "./handlers.js";

const azureDevopsDoctorTool = defineTool({
  name: "azure_devops_doctor",
  label: "Azure DevOps Doctor",
  description: "Resolve Azure DevOps configuration/auth readiness (read-only).",
  parameters: doctorToolSchema,
  async execute(_toolCallId, params: DoctorToolInput, _signal, _onUpdate, ctx) {
    return runDoctorTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

const azureDevopsGetStatusTool = defineTool({
  name: "azure_devops_get_status",
  label: "Azure DevOps Get Status",
  description: "Get build status with timeline summary and selected log mapping (read-only).",
  parameters: getStatusToolSchema,
  async execute(_toolCallId, params: GetStatusToolInput, _signal, _onUpdate, ctx) {
    return runGetStatusTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

const azureDevopsGetLogsTool = defineTool({
  name: "azure_devops_get_logs",
  label: "Azure DevOps Get Logs",
  description: "List build logs and return bounded selected log content (read-only).",
  parameters: getLogsToolSchema,
  async execute(_toolCallId, params: GetLogsToolInput, _signal, _onUpdate, ctx) {
    return runGetLogsTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

const azureDevopsDiagnoseFailureTool = defineTool({
  name: "azure_devops_diagnose_failure",
  label: "Azure DevOps Diagnose Failure",
  description: "Collect read-only build failure evidence (status, timeline, logs, artifacts metadata).",
  parameters: diagnoseFailureToolSchema,
  async execute(_toolCallId, params: DiagnoseFailureToolInput, _signal, _onUpdate, ctx) {
    return runDiagnoseFailureTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

const azureDevopsListArtifactsTool = defineTool({
  name: "azure_devops_list_artifacts",
  label: "Azure DevOps List Artifacts",
  description: "List build artifact metadata only. No download/write/extract is performed.",
  parameters: listArtifactsToolSchema,
  async execute(_toolCallId, params: ListArtifactsToolInput, _signal, _onUpdate, ctx) {
    return runListArtifactsTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

const azureDevopsListPipelinesTool = defineTool({
  name: "azure_devops_list_pipelines",
  label: "Azure DevOps List Pipelines",
  description: "List pipeline summaries (read-only).",
  parameters: listPipelinesToolSchema,
  async execute(_toolCallId, params: ListPipelinesToolInput, _signal, _onUpdate, ctx) {
    return runListPipelinesTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

const azureDevopsListBuildsTool = defineTool({
  name: "azure_devops_list_builds",
  label: "Azure DevOps List Builds",
  description: "List recent build summaries (read-only).",
  parameters: listBuildsToolSchema,
  async execute(_toolCallId, params: ListBuildsToolInput, _signal, _onUpdate, ctx) {
    return runListBuildsTool(params, { cwd: ctx.cwd, env: process.env });
  },
});

export const READ_ONLY_AZURE_DEVOPS_TOOLS = [
  azureDevopsDoctorTool,
  azureDevopsGetStatusTool,
  azureDevopsGetLogsTool,
  azureDevopsDiagnoseFailureTool,
  azureDevopsListArtifactsTool,
  azureDevopsListPipelinesTool,
  azureDevopsListBuildsTool,
] as const;

export const READ_ONLY_AZURE_DEVOPS_TOOL_NAMES = READ_ONLY_AZURE_DEVOPS_TOOLS.map((tool) => tool.name);
