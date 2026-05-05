---
name: azure-devops
description: Read-only operating manual for diagnosing Azure DevOps builds/runs with `pi-ado` and read-only extension tools, with strict ID/auth safety and explicit ask-for-missing-info behavior.
---

# Azure DevOps skill (operating manual)

Use this skill to diagnose Azure DevOps pipeline/build failures safely with the current package capabilities.

## Scope right now (Phase 7B)

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
- Local-write extension tool (preview-first; writes only with `confirm: true`):
  - `azure_devops_download_artifact`
- Build/run status lookup by build ID
- Timeline-guided log targeting by stage/job/task selectors:
  - ID/GUID selectors: `stageId`, `jobId`, `taskId`
  - Display-name selectors: `stageName`, `jobName`, `taskName` (exact > case-insensitive > substring)
- Failure diagnostics evidence bundling (`build + timeline + logs + artifacts metadata`)
- Artifact metadata listing (read-only)
- Local artifact download / extract via `pi-ado artifacts download` and `azure_devops_download_artifact`. Supports both Build Artifacts API and Pipelines Artifacts API. Preview-first with explicit confirmation.
- Read-only prompt-template wrappers: `/ado-doctor`, `/ado-status`, `/ado-logs`, `/ado-artifacts`, `/ado-diagnose`. The `/ado-artifacts` prompt now also covers preview-first download semantics.

Not implemented yet:

- Queue/cancel/rerun operations
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

# status/timeline summary for a build (ID and/or display-name selectors)
pi-ado status --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--json]

# log retrieval (targeted when possible)
pi-ado logs --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--log-id <id>] [--json]

# failure diagnostics bundle (preferred)
pi-ado diagnose --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--log-id <id>] [--max-bytes <n>] [--json]

# artifact metadata listing only; never print actionable signed URLs
pi-ado artifacts --build-id <id> [--json]

# Phase 7B local artifact download / extract (preview-first; write only with --confirm)
pi-ado artifacts download \
  --build-id <id> \
  --artifact-name <name> \
  --output <relative-path> \
  [--artifact-kind auto|build|pipeline] \
  [--pipeline-id <id>] [--run-id <id>] \
  [--max-bytes <n>] \
  [--confirm] [--extract] [--overwrite] [--json] [--mock]
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
   - Collect optional stage/job/task hints from the UI: GUID hints when available, or human-readable display names when only names are exposed.

2. **Fill missing required fields by asking**
   - If build ID is still unclear, ask for it explicitly.
   - If multiple candidate IDs exist, ask user to confirm target.

3. **Run diagnostics bundle first (preferred)**
   - `pi-ado diagnose --build-id <id> [--stage-id <guid>] [--stage-name <name>] [--job-id <guid>] [--job-name <name>] [--task-id <guid>] [--task-name <name>] [--log-id <id>] [--max-bytes <n>] [--json]`
   - Or extension: `azure_devops_diagnose_failure` with the same input concepts (`buildId` plus optional `stageId/stageName/jobId/jobName/taskId/taskName/logId/maxBytes`).

4. **If diagnostics is unavailable, fall back to status + logs + artifacts**
   - `pi-ado status`, `pi-ado logs`, `pi-ado artifacts` in read-only mode.

5. **Handle ambiguous selectors**
   - If a name selector returns `ambiguous` with a candidate list, **do not auto-pick**.
   - Show the candidate names/IDs to the user and ask for a narrower selector (more specific name, an explicit ID, or `--log-id`).
   - Stage matches provide context only; never use a stage match to derive a child job/task log.

6. **Produce evidence summary**
   - Include: build ID, matched stage/job/task records, selected log ID(s), key error excerpts, artifact list.
   - Include confidence and any missing data still needed.

## Safety categories

1. **Read-only (currently supported)**
   - Doctor, status, logs, artifacts metadata list.
   - No remote mutation and no local file writes.

2. **Local file writes (currently supported, preview + confirm)**
   - `pi-ado artifacts download` and `azure_devops_download_artifact` write artifact ZIP files (or extracted entries) under the workspace `cwd`.
   - Always run a preview first (omit `--confirm` / set `confirm: false`).
   - Show preview to the user before re-running with `--confirm` / `confirm: true`.
   - Refuse to overwrite existing files unless the user passes `--overwrite` / `overwrite: true`.
   - Refuse output paths that escape the workspace, are absolute, contain NUL bytes, or use Windows drive / UNC prefixes.
   - Treat `ambiguous` artifact source resolution as a question for the user; pass `--artifact-kind build|pipeline` only after the user disambiguates.
   - Pipeline-source resolution may need explicit `--pipeline-id` and `--run-id` when auto-inference fails.

3. **Remote mutation (not implemented yet)**
   - Queue/cancel/rerun.
   - Must remain disabled in this phase.
4. **Unsupported/dangerous**
   - Secret dumping, arbitrary mutation passthrough, fabricated IDs, unbounded log dumps.
   - Refuse and request safer scoped input.

## Ask-for-missing-info behavior (required)

If any required input is missing, ask concise follow-ups such as:

- "Please provide the Azure DevOps build ID (numeric)."
- "Do you also have a stage/job/task GUID, or a display name from the failing step UI?"
- "Several timeline records match that name; which one did you mean? (We will not auto-pick.)"
- "Should I run read-only diagnosis only (status/logs/artifacts list)?"

Do not continue with assumptions.

## Current limitations to state clearly

- Remote mutation operations (queue/cancel/rerun) are intentionally not implemented yet.
- Mutating extension tools and mutating slash prompts are not implemented yet; read-only extension tools and read-only slash prompts are available, and the local-write artifact download tool/CLI is gated behind preview + explicit confirmation.
- Artifact download/extract writes only under the workspace `cwd`, never elsewhere.
- Azure CLI fallback is not part of this current workflow.
