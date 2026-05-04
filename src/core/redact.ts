function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactSensitiveText(value: string, additionalSensitiveValues: string[] = []): string {
  let redacted = value;

  for (const sensitiveValue of additionalSensitiveValues) {
    if (!sensitiveValue) continue;
    redacted = redacted.replace(new RegExp(escapeRegExp(sensitiveValue), "g"), "[REDACTED]");
  }

  return redacted
    .replace(/(Authorization\s*[:=]\s*)(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [REDACTED]")
    .replace(/([?&](?:sig|signature|token|access_token|auth)=)[^&\s"']+/gi, "$1[REDACTED]");
}

export function summarizePayloadForError(data: unknown): string {
  if (typeof data === "string") {
    return data.replace(/\s+/g, " ").slice(0, 500);
  }

  if (!data || typeof data !== "object") {
    return String(data).slice(0, 500);
  }

  const obj = data as Record<string, unknown>;
  const candidate = obj.message ?? obj.errorDescription ?? obj.error;
  if (typeof candidate === "string") {
    return candidate.replace(/\s+/g, " ").slice(0, 500);
  }

  return JSON.stringify(data).slice(0, 500);
}
