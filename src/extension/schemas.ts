import { Type } from "typebox";

const scopeOverrideProperties = {
  profile: Type.Optional(Type.String({ minLength: 1, description: "Optional profile override" })),
  organization: Type.Optional(Type.String({ minLength: 1, description: "Optional organization slug or URL override" })),
  project: Type.Optional(Type.String({ minLength: 1, description: "Optional project override" })),
  mock: Type.Optional(Type.Boolean({ description: "Use fixture-backed mock mode (no network)" })),
} as const;

export const doctorToolSchema = Type.Object({
  ...scopeOverrideProperties,
});

export const getStatusToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
});

export const getLogsToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
  logId: Type.Optional(Type.Integer({ minimum: 1, description: "Optional explicit log ID override" })),
  maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, description: "Optional log content max bytes (1-100000)" })),
});

export const diagnoseFailureToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
  logId: Type.Optional(Type.Integer({ minimum: 1, description: "Optional explicit log ID override" })),
  maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, description: "Optional log content max bytes (1-100000)" })),
});

export const listArtifactsToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
});

export const listPipelinesToolSchema = Type.Object({
  ...scopeOverrideProperties,
  top: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Max number of pipelines to return (default 10)" })),
});

export const listBuildsToolSchema = Type.Object({
  ...scopeOverrideProperties,
  top: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Max number of builds to return (default 10)" })),
});
