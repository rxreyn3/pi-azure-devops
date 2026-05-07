import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAzureDevOpsClient } from "../client.js";
import { resolveAzureDevOpsConfig } from "../config.js";
import { DEFAULT_LOG_MAX_BYTES, MAX_LOG_MAX_BYTES } from "../limits.js";
import { createFixtureFetch } from "../mock.js";
import { redactSensitiveText } from "../redact.js";
import { createReadOnlyRestClient } from "../rest.js";
import { resolveScope } from "../scope.js";
import { getAuthSensitiveValues, resolveTokenFromEnv } from "../auth.js";

import type { DoctorRuntime, OperationRuntime, OperationRuntimeContext } from "./types.js";

export const DEFAULT_TOP = 10;
export const MAX_TOP = 50;

interface CommonScopeInput {
  profile?: string;
  organization?: string;
  project?: string;
  mock?: boolean;
}

export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function safeTop(value?: number): number {
  if (value === undefined) return DEFAULT_TOP;
  return clampInteger(value, 1, MAX_TOP);
}

export function safeMaxBytes(value?: number): number {
  if (value === undefined) return DEFAULT_LOG_MAX_BYTES;
  return clampInteger(value, 1, MAX_LOG_MAX_BYTES);
}

export function formatToolText(
  title: string,
  payload: unknown,
  additionalSensitiveValues: string[] = [],
): string {
  const serialized = JSON.stringify(payload, null, 2);
  const redacted = redactSensitiveText(serialized, additionalSensitiveValues);
  return `${title}\n${redacted}`;
}

export function findWorkspaceRoot(startFile: string): string {
  let current = path.dirname(startFile);

  while (true) {
    const candidate = path.join(current, "package.json");
    if (existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function moduleWorkspaceRoot(): string {
  return findWorkspaceRoot(fileURLToPath(import.meta.url));
}

export function resolveOperationContext(
  partial?: Partial<OperationRuntimeContext>,
): OperationRuntimeContext {
  return {
    cwd: partial?.cwd ?? process.cwd(),
    env: partial?.env ?? process.env,
  };
}

function pickScopeInput(input: CommonScopeInput) {
  return {
    ...(input.organization !== undefined ? { organization: input.organization } : {}),
    ...(input.project !== undefined ? { project: input.project } : {}),
    ...(input.profile !== undefined ? { profile: input.profile } : {}),
  };
}

export async function resolveDoctorRuntime(
  input: CommonScopeInput,
  context: OperationRuntimeContext,
): Promise<DoctorRuntime> {
  const config = await resolveAzureDevOpsConfig({
    ...pickScopeInput(input),
    env: context.env,
    cwd: context.cwd,
  });

  const token = resolveTokenFromEnv(context.env);

  return {
    mode: input.mock ? "mock" : "live",
    config,
    token: token ?? undefined,
  };
}

export async function createOperationRuntime(
  input: CommonScopeInput,
  context: OperationRuntimeContext,
): Promise<OperationRuntime> {
  const config = await resolveAzureDevOpsConfig({
    ...pickScopeInput(input),
    env: context.env,
    cwd: context.cwd,
  });

  const mode: "mock" | "live" = input.mock ? "mock" : "live";

  if (mode === "mock") {
    const scope = resolveScope({
      organization: config.organization ?? "mock-org",
      project: config.project ?? "mock-project",
    });

    const rest = createReadOnlyRestClient({
      token: "mock-token",
      fetchImpl: createFixtureFetch(moduleWorkspaceRoot()),
    });

    return {
      mode,
      client: createAzureDevOpsClient(scope, rest),
      scope: {
        organization: scope.organization,
        project: scope.project,
        ...(config.profile !== undefined ? { profile: config.profile } : {}),
      },
      authSensitiveValues: [],
    };
  }

  const token = resolveTokenFromEnv(context.env);
  if (!token) {
    throw new Error(
      "Missing token. Set PI_AZURE_DEVOPS_PAT, PI_ADO_PAT, AZURE_DEVOPS_PAT, AZURE_DEVOPS_EXT_PAT, ADO_PAT, or SYSTEM_ACCESSTOKEN.",
    );
  }

  const scope = resolveScope({
    organization: config.organization,
    project: config.project,
  });

  const rest = createReadOnlyRestClient({ token: token.token });

  return {
    mode,
    client: createAzureDevOpsClient(scope, rest),
    scope: {
      organization: scope.organization,
      project: scope.project,
      ...(config.profile !== undefined ? { profile: config.profile } : {}),
    },
    authSensitiveValues: getAuthSensitiveValues(token.token),
  };
}
