# API Boundary (Frozen Names for Initial Phases)

This document freezes initial naming and safety contracts for spike → core → CLI → extension.
For day-to-day operating behavior, use `skills/azure-devops/SKILL.md` as the primary manual.

## CLI command names

Implemented now:

- `pi-ado doctor` (read-only)
- `pi-ado status` (read-only)
- `pi-ado logs` (read-only)
- `pi-ado diagnose` (read-only)
- `pi-ado artifacts` (read-only metadata listing)
- `pi-ado artifacts download` (local file write only; preview-first, requires `--confirm`)

Reserved/planned (not yet implemented):

- `pi-ado pipelines list`
- `pi-ado build get`
- `pi-ado timeline`
- `pi-ado logs list`
- `pi-ado logs get`
- `pi-ado artifacts list`
- `pi-ado run preview`
- `pi-ado run queue`
- `pi-ado cancel`
- `pi-ado rerun`

## Frozen tool names

Implemented read-only extension tools:

- `azure_devops_doctor`
- `azure_devops_get_status`
- `azure_devops_get_logs`
- `azure_devops_diagnose_failure`
- `azure_devops_list_artifacts`
- `azure_devops_list_pipelines`
- `azure_devops_list_builds`

Implemented local-write extension tools:

- `azure_devops_download_artifact` (preview-first; writes only with `confirm: true`)

Reserved/planned read-only tools (not implemented yet):

- `azure_devops_list_runs`
- `azure_devops_get_run_status`
- `azure_devops_get_timeline`
- `azure_devops_list_logs`
- `azure_devops_get_log`

Side-effectful (future, gated):

- `azure_devops_preview_run`
- `azure_devops_queue_run`
- `azure_devops_cancel_run`
- `azure_devops_rerun`

## Frozen prompt names

Implemented now (read-only templates):

- `/ado-doctor`
- `/ado-status`
- `/ado-logs`
- `/ado-artifacts`
- `/ado-diagnose`

Reserved/planned (not implemented yet):

- `/ado-run`
- `/ado-cancel`
- `/ado-rerun`
- `/ado-diagnose-deep`

## Input reference model rules

Use discriminated refs (no ambiguous optional-id combinations):

```ts
export type PipelineRef =
  | { kind: "pipeline"; pipelineId: string | number; pipelineAlias?: string }
  | { kind: "buildDefinition"; definitionId: string | number; pipelineAlias?: string }
  | { kind: "alias"; pipelineAlias: string };

export type RunRef =
  | { kind: "pipelineRun"; runId: string | number; pipelineId: string | number }
  | { kind: "build"; buildId: string | number };
```

## Output model rules

1. Normalized summaries are stable and caller-facing.
2. Raw Azure DevOps payloads are opt-in only and tagged with source metadata.
3. Include `details.source: "build" | "pipelines"` where dual APIs exist.
4. Redaction happens at output/log/error sinks, not by mutating internal raw data needed by follow-up calls.

## Diagnostic mapping concern (UI GUIDs and display names → timeline → numeric log IDs)

Azure DevOps UI links frequently expose job/task GUID-style identifiers, while build-log retrieval requires numeric `logId` values. Diagnostics tooling should therefore:

1. Accept optional UI-derived `stageId`/`jobId`/`taskId` hints **and** human-readable display-name hints (`stageName`, `jobName`, `taskName`).
2. Resolve those identifiers against build timeline records.
3. Match name selectors in this order: exact, case-insensitive exact, substring. Multiple matches at any tier are surfaced as an `ambiguous` lookup result with candidates; the resolver does not auto-pick a record and does not fall through to broader tiers.
  - Note: ID selectors are role-agnostic (preserving the prior `jobId`/`taskId` semantics) — passing a Task GUID via `--job-id` will match the Task record. Name selectors are role-scoped to their declared role via the `Stage`/`Job`/`Task` timeline `type`.
4. Prefer `timelineRecord.log.id` from a matched task, then job, when present for targeted log fetch.
5. Fall back to explicit `logId` when no record-derived log is available.
6. Fall back to the first listed build log only when no stage/job/task selector was supplied at all. If any selector is supplied, do not fall back to the first log.
7. Stage selectors are status/evidence context only; do not derive a child job/task log from a stage match.

This mapping is part of the Phase 7A read-only behavior and remains explicit in the core/client/tool contracts.

## Safety categories

1. **Read-only**: list/get status/timeline/logs/artifacts metadata.
2. **Local write (implemented)**: artifact download / extract via `pi-ado artifacts download` and `azure_devops_download_artifact`. Preview-first with explicit confirmation. Output paths constrained to workspace `cwd`. Signed URLs are redacted and never sent the Azure DevOps PAT.
3. **Remote mutation (not implemented)**: queue/cancel/rerun.
4. **Unsupported danger**: arbitrary raw mutation passthrough, secret dumping.

Safety contract summary:

- Read-only operations run without confirmation.
- Local writes require preview + explicit confirmation.
- Remote mutations require preview + explicit confirmation and must fail closed when no interactive UI is available.
- Config resolution/doctor performs **no Git remote inference**.
