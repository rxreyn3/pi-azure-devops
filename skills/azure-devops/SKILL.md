---
name: azure-devops
description: Read-only operating manual for diagnosing Azure DevOps builds/runs with `pi-ado` and read-only extension tools, with strict ID/auth safety and explicit ask-for-missing-info behavior.
---

# Azure DevOps skill (operating manual)

Use this skill to diagnose Azure DevOps pipeline/build failures safely with the current package capabilities.

## Scope right now (Phase 6A)

Implemented and supported now:

- Read-only CLI/core diagnostics via `pi-ado`
- Read-only extension tools:
  - `azure_devops_doctor`
  - `azure_devops_get_status`
  - `azure_devops_get_logs`
  - `azure_devops_diagnose_failure`
  - `azure_devops_list_artifacts`
  - `azure_devops_list_pipelines`
  - `azure_devops_list_builds`
- Build/run status lookup by build ID
- Timeline-guided log targeting by job/task IDs
- Failure diagnostics evidence bundling (`build + timeline + logs + artifacts metadata`)
- Artifact metadata listing (read-only; no download/write)
- Read-only prompt-template wrappers: `/ado-doctor`, `/ado-status`, `/ado-logs`, `/ado-artifacts`, `/ado-diagnose`

Not implemented yet:

- Queue/cancel/rerun operations
- Artifact download/write/extract operations
- Mutating extension tools (`azure_devops_preview_run`, `azure_devops_queue_run`, `azure_devops_cancel_run`, `azure_devops_rerun`)
- Mutating prompt templates (`/ado-run`, `/ado-cancel`, `/ado-rerun`)

Do **not** imply unavailable tools exist.

## Non-negotiable operating rules

1. **REST-first, read-only first**
   - Use the package read-only commands before proposing any mutating action.
   - Do not use Azure CLI fallback. If the user explicitly asks for Azure CLI in the future, treat it as a separate explicit decision.

2. **Never invent identifiers**
   - Never guess or fabricate organization/project/pipeline/build/run/job/task/log IDs.
   - If required identifiers are missing, ask the user to provide them.

3. **Protect secrets and signed URLs**
   - Never print PATs, auth headers, secret variable values, or unredacted signed URLs.
   - Keep summaries useful while preserving redaction.

4. **Bound evidence collection**
   - Prefer targeted logs (`jobId`/`taskId`/`logId`) and bounded outputs.
   - Avoid dumping large unbounded logs into context.

5. **Ask for missing context instead of guessing**
   - If org/project/build references are ambiguous or absent, stop and ask.
   - Confirm exactly what the user wants diagnosed before proceeding.

## Current command surface

Use placeholders and env vars only; never hardcode real tenant/repo values.

```bash
# readiness check (mock or live)
pi-ado doctor [--json] [--mock]

# status/timeline summary for a build
pi-ado status --build-id <id> [--job-id <guid>] [--task-id <guid>] [--json]

# log retrieval (targeted when possible)
pi-ado logs --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--json]

# failure diagnostics bundle (preferred)
pi-ado diagnose --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--max-bytes <n>] [--json]

# artifact metadata listing only; do not dereference/download URLs
pi-ado artifacts --build-id <id> [--json]
```

Optional mock validation (no network/token):

```bash
pi-ado doctor --mock --json
```

Live runs require explicit org/project/token configuration from user input/env/config (do not infer from unrelated local context).

## Diagnostic workflow (UI URL -> evidence summary)

When the user provides an Azure DevOps UI URL:

1. **Extract references from URL/user context**
   - Identify the build/run ID from URL path/query when present.
   - Collect optional job/task GUID hints if provided by the UI link.

2. **Fill missing required fields by asking**
   - If build ID is still unclear, ask for it explicitly.
   - If multiple candidate IDs exist, ask user to confirm target.

3. **Run diagnostics bundle first (preferred)**
   - `pi-ado diagnose --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--max-bytes <n>] [--json]`
   - Or extension: `azure_devops_diagnose_failure` with the same input concepts.

4. **If diagnostics is unavailable, fall back to status + logs + artifacts**
   - `pi-ado status`, `pi-ado logs`, `pi-ado artifacts` in read-only mode.

5. **Produce evidence summary**
   - Include: build ID, failing job/task names, selected log ID(s), key error excerpts, artifact list.
   - Include confidence and any missing data still needed.

## Safety categories

1. **Read-only (currently supported)**
   - Doctor, status, logs, artifacts metadata list.
   - No remote mutation and no local file writes.

2. **Local file writes (not implemented yet)**
   - Artifact download/write/extract.
   - Must remain disabled in this phase.

3. **Remote mutation (not implemented yet)**
   - Queue/cancel/rerun.
   - Must remain disabled in this phase.

4. **Unsupported/dangerous**
   - Secret dumping, arbitrary mutation passthrough, fabricated IDs, unbounded log dumps.
   - Refuse and request safer scoped input.

## Ask-for-missing-info behavior (required)

If any required input is missing, ask concise follow-ups such as:

- "Please provide the Azure DevOps build ID (numeric)."
- "Do you also have the job/task GUID from the failing step URL?"
- "Should I run read-only diagnosis only (status/logs/artifacts list)?"

Do not continue with assumptions.

## Current limitations to state clearly

- Mutating operations are intentionally not implemented yet.
- Mutating extension tools and mutating slash prompts are not implemented yet; read-only extension tools and read-only slash prompts are available.
- Artifact download/write is not implemented yet.
- Azure CLI fallback is not part of this current workflow.
