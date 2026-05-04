# API Boundary (Frozen Names for Initial Phases)

This document freezes initial naming and safety contracts for spike → core → CLI → extension.
For day-to-day operating behavior, use `skills/azure-devops/SKILL.md` as the primary manual.

## CLI command names

Implemented now (read-only):

- `pi-ado doctor`
- `pi-ado status`
- `pi-ado logs`
- `pi-ado diagnose`
- `pi-ado artifacts`

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

Reserved/planned read-only tools (not implemented yet):

- `azure_devops_list_runs`
- `azure_devops_get_run_status`
- `azure_devops_get_timeline`
- `azure_devops_list_logs`
- `azure_devops_get_log`

Side-effectful (future, gated):

- `azure_devops_download_artifact`
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

## Diagnostic mapping concern (UI GUIDs → timeline → numeric log IDs)

Azure DevOps UI links frequently expose job/task GUID-style identifiers, while build-log retrieval requires numeric `logId` values. Diagnostics tooling should therefore:

1. Accept optional UI-derived `jobId`/`taskId` hints.
2. Resolve those IDs against build timeline records.
3. Prefer `timelineRecord.log.id` when present for targeted log fetch.
4. Fall back safely to explicit `logId`, then first listed build log when no mapping is possible.

This mapping is now part of the Phase 0 spike behavior and should remain explicit in future core/client/tool contracts.

## Safety categories

1. **Read-only**: list/get status/timeline/logs/artifacts.
2. **Local write**: artifact download/write.
3. **Remote mutation**: queue/cancel/rerun.
4. **Unsupported danger**: arbitrary raw mutation passthrough, secret dumping.

Safety contract summary:

- Read-only operations run without confirmation.
- Local writes require preview + explicit confirmation.
- Remote mutations require preview + explicit confirmation and must fail closed when no interactive UI is available.
- Config resolution/doctor performs **no Git remote inference**.
