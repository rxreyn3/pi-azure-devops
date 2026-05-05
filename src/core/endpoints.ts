import type { AzureDevOpsScope } from "./models.js";

export const API_VERSION_DEFAULT = "7.1";

export interface NormalizedOrganization {
  organizationSlug: string;
  organizationUrl: string;
}

export function normalizeOrganization(organization: string): NormalizedOrganization {
  const trimmed = organization.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Organization cannot be empty");
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    if (host === "dev.azure.com") {
      const slug = parsed.pathname.split("/").filter(Boolean)[0];
      if (!slug) {
        throw new Error("Azure DevOps organization URL must include an organization slug");
      }
      return {
        organizationSlug: decodeURIComponent(slug),
        organizationUrl: `https://dev.azure.com/${encodeURIComponent(decodeURIComponent(slug))}`,
      };
    }

    if (host.endsWith(".visualstudio.com")) {
      const slug = host.split(".")[0] ?? "";
      if (!slug) {
        throw new Error("Azure DevOps visualstudio.com URL must include an organization slug");
      }
      return {
        organizationSlug: decodeURIComponent(slug),
        organizationUrl: `${parsed.protocol}//${parsed.hostname}`,
      };
    }

    throw new Error(`Unsupported Azure DevOps organization URL host: ${parsed.hostname}`);
  } catch (error) {
    if (error instanceof TypeError) {
      const slug = trimmed;
      return {
        organizationSlug: decodeURIComponent(slug),
        organizationUrl: `https://dev.azure.com/${encodeURIComponent(decodeURIComponent(slug))}`,
      };
    }
    throw error;
  }
}

export function buildProjectBaseUrl(scope: Pick<AzureDevOpsScope, "organizationUrl" | "project">): string {
  const project = scope.project.trim();
  if (!project) {
    throw new Error("Project cannot be empty");
  }
  return `${scope.organizationUrl.replace(/\/+$/, "")}/${encodeURIComponent(project)}`;
}

export function buildReadOnlyEndpoints(scope: Pick<AzureDevOpsScope, "organizationUrl" | "project">) {
  const base = buildProjectBaseUrl(scope);

  return {
    listPipelines: (top: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/pipelines?$top=${top}&api-version=${encodeURIComponent(apiVersion)}`,
    listBuilds: (top: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/build/builds?$top=${top}&queryOrder=queueTimeDescending&api-version=${encodeURIComponent(apiVersion)}`,
    getBuild: (buildId: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/build/builds/${buildId}?api-version=${encodeURIComponent(apiVersion)}`,
    getRun: (pipelineId: number, runId: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/pipelines/${pipelineId}/runs/${runId}?api-version=${encodeURIComponent(apiVersion)}`,
    getTimeline: (buildId: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/build/builds/${buildId}/timeline?api-version=${encodeURIComponent(apiVersion)}`,
    listLogs: (buildId: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/build/builds/${buildId}/logs?api-version=${encodeURIComponent(apiVersion)}`,
    getLog: (
      buildId: number,
      logId: number,
      opts: { startLine?: number; endLine?: number; apiVersion?: string } = {},
    ) => {
      const apiVersion = opts.apiVersion ?? API_VERSION_DEFAULT;
      const params = new URLSearchParams();
      if (opts.startLine !== undefined) params.set("startLine", String(opts.startLine));
      if (opts.endLine !== undefined) params.set("endLine", String(opts.endLine));
      params.set("api-version", apiVersion);
      return `${base}/_apis/build/builds/${buildId}/logs/${logId}?${params.toString()}`;
    },
    listArtifacts: (buildId: number, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/build/builds/${buildId}/artifacts?api-version=${encodeURIComponent(apiVersion)}`,
    getBuildArtifact: (buildId: number, artifactName: string, apiVersion = API_VERSION_DEFAULT) =>
      `${base}/_apis/build/builds/${buildId}/artifacts?artifactName=${encodeURIComponent(artifactName)}&api-version=${encodeURIComponent(apiVersion)}`,
    getPipelineArtifact: (
      pipelineId: number,
      runId: number,
      artifactName: string,
      expandSignedContent = false,
      apiVersion = API_VERSION_DEFAULT,
    ) =>
      `${base}/_apis/pipelines/${pipelineId}/runs/${runId}/artifacts?artifactName=${encodeURIComponent(artifactName)}${expandSignedContent ? "&$expand=signedContent" : ""}&api-version=${encodeURIComponent(apiVersion)}`,
  };
}
