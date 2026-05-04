import type { AzureDevOpsScope } from "./models.js";
import { normalizeOrganization } from "./endpoints.js";

export function resolveScope(input: { organization: string | undefined; project: string | undefined }): AzureDevOpsScope {
  if (!input.organization) {
    throw new Error("Organization is required");
  }
  if (!input.project) {
    throw new Error("Project is required");
  }

  const normalized = normalizeOrganization(input.organization);

  return {
    organization: normalized.organizationSlug,
    organizationUrl: normalized.organizationUrl,
    project: input.project,
  };
}
