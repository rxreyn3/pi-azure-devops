import { redactSensitiveText } from "./redact.js";

export const TOKEN_ENV_KEYS = [
  "PI_AZURE_DEVOPS_PAT",
  "PI_ADO_PAT",
  "AZURE_DEVOPS_PAT",
  "AZURE_DEVOPS_EXT_PAT",
  "ADO_PAT",
  "SYSTEM_ACCESSTOKEN",
] as const;

export interface ResolvedToken {
  token: string;
  source: string;
}

export function resolveTokenFromEnv(env: NodeJS.ProcessEnv = process.env): ResolvedToken | undefined {
  for (const key of TOKEN_ENV_KEYS) {
    const value = env[key];
    if (value && value.trim()) {
      return {
        token: value.trim(),
        source: key,
      };
    }
  }
  return undefined;
}

export function buildBasicAuthHeader(token: string): string {
  const encoded = Buffer.from(`:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

export function getAuthSensitiveValues(token?: string): string[] {
  if (!token) return [];
  return [token, buildBasicAuthHeader(token)];
}

export function redactWithAuth(value: string, token?: string): string {
  return redactSensitiveText(value, getAuthSensitiveValues(token));
}
