# Safety Model (Current read-only phase)

`skills/azure-devops/SKILL.md` is the operational manual. This document is the concise contract boundary.

## Operation classes

1. **Read-only (implemented)**
   - CLI: `doctor`, `status`, `logs`, `diagnose`, `artifacts` (metadata list only).
   - Extension tools: `azure_devops_doctor`, `azure_devops_get_status`, `azure_devops_get_logs`, `azure_devops_diagnose_failure`, `azure_devops_list_artifacts`, `azure_devops_list_pipelines`, `azure_devops_list_builds`.
2. **Local write (implemented)**
   - CLI: `artifacts download` (preview-first; writes only with `--confirm`).
   - Extension tools: `azure_devops_download_artifact` (preview-first; writes only with `confirm: true`).
3. **Remote mutation (not implemented)**
   - Queue/cancel/rerun.
4. **Unsupported/dangerous**
   - Secret dumping, unbounded log dumping, fabricated IDs, arbitrary mutation passthrough.

## Required rules in this phase

- REST-first and read-only-first.
- Never invent org/project/pipeline/build/run/job/task/log identifiers.
- Ask the user for missing required inputs instead of guessing.
- Never print PATs/auth headers/secret variables/signed URL secrets.
- Keep logs bounded and targeted.
- No Azure CLI fallback behavior unless explicitly approved in a future phase.
- Treat ambiguous name-selector results (multiple candidates returned for `stageName`/`jobName`/`taskName`) as a question for the user, not a default to auto-pick.
- Stage selectors are status/evidence context only and never infer child task/job logs.

## Current guarantees

- Read-only CLI/core/extension behavior is implemented.
- Local-write artifact download/extract is implemented under preview + explicit confirmation.
  - Output paths are constrained to the workspace `cwd`. Absolute paths, NUL bytes, Windows drive prefixes, UNC prefixes, and `..` traversal are refused.
  - Existing files are never overwritten without `--overwrite` / `overwrite: true`.
  - ZIP extraction validates every entry path against the destination directory before any file is written, refusing absolute, drive-prefixed, UNC, or `..`-traversing entries (Zip Slip).
  - Build artifact downloads use the Azure DevOps Authorization header. Pipeline artifact signed-content downloads are fetched with **no** Authorization header to avoid leaking PATs to backing storage hosts.
  - Signed artifact URLs are added to redaction-sensitive values for every download error, and never appear in CLI/tool result payloads.
- Read-only prompt templates remain available (`ado-doctor`, `ado-status`, `ado-logs`, `ado-artifacts`, `ado-diagnose`).
- Mock mode supports no-network validation, including the new artifact download / extract flow.
- No remote mutation codepaths are available from the current CLI or extension surfaces.
- Sensitive auth/signed URL content is redacted at output/error sinks.

## Deferred safety gates (future phases)

- Preview + explicit confirmation + fail-closed non-interactive behavior for remote mutations.
