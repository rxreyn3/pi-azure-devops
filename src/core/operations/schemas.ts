import { Type } from "typebox";

const scopeOverrideProperties = {
  profile: Type.Optional(Type.String({ minLength: 1, description: "Optional profile override" })),
  organization: Type.Optional(Type.String({ minLength: 1, description: "Optional organization slug or URL override" })),
  project: Type.Optional(Type.String({ minLength: 1, description: "Optional project override" })),
  mock: Type.Optional(Type.Boolean({ description: "Use fixture-backed mock mode (no network)" })),
} as const;

const buildIdProperty = Type.Integer({ minimum: 1, description: "Required build ID" });

const stageSelectorProperties = {
  stageId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline stage record ID/GUID" })),
  jobId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline job record ID/GUID" })),
  jobName: Type.Optional(
    Type.String({ minLength: 1, description: "Optional timeline job display name (exact > case-insensitive > substring)" }),
  ),
  taskId: Type.Optional(Type.String({ minLength: 1, description: "Optional timeline task record ID/GUID" })),
  taskName: Type.Optional(
    Type.String({ minLength: 1, description: "Optional timeline task display name (exact > case-insensitive > substring)" }),
  ),
} as const;

const stageNameStatusOnly = Type.Optional(
  Type.String({
    minLength: 1,
    description: "Optional timeline stage display name (status context only; never infers child logs)",
  }),
);

const stageNameMatching = Type.Optional(
  Type.String({
    minLength: 1,
    description: "Optional timeline stage display name (exact > case-insensitive > substring)",
  }),
);

const logRangeProperties = {
  logId: Type.Optional(Type.Integer({ minimum: 1, description: "Optional explicit log ID override" })),
  startLine: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Optional log line number to start at, inclusive (1-indexed).",
    }),
  ),
  endLine: Type.Optional(
    Type.Integer({ minimum: 1, description: "Optional log line number to end at, inclusive (1-indexed)." }),
  ),
} as const;

export const doctorInputSchema = Type.Object({
  ...scopeOverrideProperties,
});

export const getStatusInputSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: buildIdProperty,
  ...stageSelectorProperties,
  stageName: stageNameMatching,
});

export const getLogsInputSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: buildIdProperty,
  ...stageSelectorProperties,
  stageName: stageNameStatusOnly,
  ...logRangeProperties,
  maxBytes: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100000,
      description:
        "Optional log content max characters (1-100000). Slice taken from log start; for build logs the failure typically appears near the end. Prefer startLine/endLine for tail or window fetches when content is needed.",
    }),
  ),
});

export const diagnoseFailureInputSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: buildIdProperty,
  ...stageSelectorProperties,
  stageName: stageNameStatusOnly,
  ...logRangeProperties,
  maxBytes: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100000,
      description:
        "Optional log content max characters (1-100000). Slice taken from log start; prefer startLine/endLine for tail or window fetches. The most authoritative failure text is in the returned `failedRecords[].issueMessages` and is not truncated by this cap.",
    }),
  ),
});

export const listArtifactsInputSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: buildIdProperty,
});

export const downloadArtifactInputSchema = Type.Object({
  ...scopeOverrideProperties,
  buildId: buildIdProperty,
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
  extract: Type.Optional(Type.Boolean({ description: "Extract ZIP into outputPath (treated as directory)" })),
  overwrite: Type.Optional(
    Type.Boolean({ description: "Allow overwriting existing files; default refuses overwrite" }),
  ),
  maxBytes: Type.Optional(
    Type.Integer({ minimum: 1, description: "Optional max artifact byte cap (default 100 MiB)" }),
  ),
  artifactKind: Type.Optional(
    Type.Union([Type.Literal("auto"), Type.Literal("build"), Type.Literal("pipeline")], {
      description: "Artifact source family selector; default auto",
    }),
  ),
  pipelineId: Type.Optional(
    Type.Integer({ minimum: 1, description: "Pipeline ID for Pipelines Artifacts API" }),
  ),
  runId: Type.Optional(Type.Integer({ minimum: 1, description: "Run ID for Pipelines Artifacts API" })),
});

export const listPipelinesInputSchema = Type.Object({
  ...scopeOverrideProperties,
  top: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 50, description: "Max number of pipelines to return (default 10)" }),
  ),
});

export const listBuildsInputSchema = Type.Object({
  ...scopeOverrideProperties,
  top: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 50, description: "Max number of builds to return (default 10)" }),
  ),
});
