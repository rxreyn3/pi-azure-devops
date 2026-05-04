# Safety Model (Current read-only phase)

`skills/azure-devops/SKILL.md` is the operational manual. This document is the concise contract boundary.

## Operation classes

1. **Read-only (implemented)**
   - CLI: `doctor`, `status`, `logs`, `diagnose`, `artifacts` (metadata list only).
   - Extension tools: `azure_devops_doctor`, `azure_devops_get_status`, `azure_devops_get_logs`, `azure_devops_diagnose_failure`, `azure_devops_list_artifacts`, `azure_devops_list_pipelines`, `azure_devops_list_builds`.
2. **Local write (not implemented)**
   - Artifact download/write/extract.
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

## Current guarantees

- Only read-only CLI/core/extension behavior is implemented.
- Read-only prompt templates remain available (`ado-doctor`, `ado-status`, `ado-logs`, `ado-artifacts`, `ado-diagnose`).
- Mock mode supports no-network validation.
- No mutation or artifact-write codepaths are available from the current CLI or extension surfaces.
- Sensitive auth/signed URL content is redacted at output/error sinks.

## Deferred safety gates (future phases)

- Preview + explicit confirmation for local writes.
- Preview + explicit confirmation + fail-closed non-interactive behavior for remote mutations.
- Extension-level confirmation gates once tools exist.
