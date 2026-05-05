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
  stageId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage record ID/GUID" })),
  stageName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage display name (exact > case-insensitive > substring)" })),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  jobName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job display name (exact > case-insensitive > substring)" })),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
  taskName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task display name (exact > case-insensitive > substring)" })),
});

export const getLogsToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
  stageId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage record ID/GUID" })),
  stageName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage display name (status context only; never infers child logs)" })),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  jobName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job display name (exact > case-insensitive > substring)" })),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
  taskName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task display name (exact > case-insensitive > substring)" })),
  logId: Type.Optional(Type.Integer({ minimum: 1, description: "Optional explicit log ID override" })),
  maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, description: "Optional log content max characters (1-100000). Slice taken from log start; for build logs the failure typically appears near the end. Prefer startLine/endLine for tail or window fetches when content is needed." })),
  startLine: Type.Optional(Type.Integer({ minimum: 1, description: "Optional log line number to start at, inclusive (1-indexed). Pair with endLine for a tail or window without head-only maxBytes truncation." })),
  endLine: Type.Optional(Type.Integer({ minimum: 1, description: "Optional log line number to end at, inclusive (1-indexed)." })),
});

export const diagnoseFailureToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
  stageId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage record ID/GUID" })),
  stageName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage display name (status context only; never infers child logs)" })),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  jobName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job display name (exact > case-insensitive > substring)" })),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
  taskName: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task display name (exact > case-insensitive > substring)" })),
  logId: Type.Optional(Type.Integer({ minimum: 1, description: "Optional explicit log ID override" })),
  maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, description: "Optional log content max characters (1-100000). Slice taken from log start; prefer startLine/endLine for tail or window fetches. The most authoritative failure text is in the returned `failedRecords[].issueMessages` and is not truncated by this cap." })),
  startLine: Type.Optional(Type.Integer({ minimum: 1, description: "Optional log line number to start at, inclusive (1-indexed)." })),
  endLine: Type.Optional(Type.Integer({ minimum: 1, description: "Optional log line number to end at, inclusive (1-indexed)." })),
});

export const listArtifactsToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
});

export const downloadArtifactToolSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: Type.Integer({ minimum: 1, description: "Required build ID" }),
  artifactName: Type.String({ minLength: 1, description: "Required artifact name to download" }),
  outputPath: Type.String({
    minLength: 1,
    description: "Required output path relative to cwd; file when extract=false, directory when extract=true",
  }),
  confirm: Type.Optional(
    Type.Boolean({
      description: "Required true to perform a local file write; default false returns preview only",
    }),
  ),
  extract: Type.Optional(
    Type.Boolean({ description: "Extract ZIP into outputPath (treated as directory)" }),
  ),
  overwrite: Type.Optional(
    Type.Boolean({ description: "Allow overwriting existing files; default refuses overwrite" }),
  ),
  maxBytes: Type.Optional(
    Type.Integer({ minimum: 1, description: "Optional max artifact byte cap (default 100 MiB)" }),
  ),
  artifactKind: Type.Optional(
    Type.Union(
      [Type.Literal("auto"), Type.Literal("build"), Type.Literal("pipeline")],
      { description: "Artifact source family selector; default auto" },
    ),
  ),
  pipelineId: Type.Optional(
    Type.Integer({ minimum: 1, description: "Pipeline ID for Pipelines Artifacts API" }),
  ),
  runId: Type.Optional(Type.Integer({ minimum: 1, description: "Run ID for Pipelines Artifacts API" })),
});

export const listPipelinesToolSchema = Type.Object({
  ...scopeOverrideProperties,
  top: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Max number of pipelines to return (default 10)" })),
});

export const listBuildsToolSchema = Type.Object({
  ...scopeOverrideProperties,
  top: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Max number of builds to return (default 10)" })),
});
