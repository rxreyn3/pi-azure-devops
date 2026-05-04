# Generic Pi Azure DevOps — Forward Plan

This is the durable forward-looking project plan for `pi-azure-devops`. It
replaces the deleted historical plan that previously lived at
`/home/ryan/dev/shotgrid-render-pipeline/generic-pi-azure-devops-plan.md`.

This document is planning only. It does not authorize source, prompt, docs,
package manifest, or test changes. Implementation of any phase below requires
an explicit follow-up session.

## 1. Current state (delivered through Phase 6A)

`pi-azure-devops` is a generic, REST-first Azure DevOps integration package
for Pi. It is not a repo-specific ShotGrid helper.

Delivered scope is read-only:

- Core modules under `src/core/`:
  - `config.ts`, `auth.ts`, `endpoints.ts`, `rest.ts`, `client.ts`,
    `models.ts`, `redact.ts`, `parsing.ts`, `scope.ts`, `mock.ts`,
    `diagnostics.ts`.
  - `rest.ts` is GET-only (`getJson`, `getText`) with bounded text retrieval.
    No POST/PATCH/download transport exists yet.
  - `client.ts` resolves timeline records by GUID/ID only via
    `findTimelineRecordById`. No display-name lookup.
  - `resolveBuildLogSelection` precedence today: task log → job log →
    explicit log id → first listed log.
  - `diagnostics.ts` uses the same ID-only timeline lookup for matched
    job/task records.
- CLI `pi-ado` commands: `doctor`, `status`, `logs`, `diagnose`, `artifacts`.
- Read-only extension tools:
  - `azure_devops_doctor`
  - `azure_devops_get_status`
  - `azure_devops_get_logs`
  - `azure_devops_diagnose_failure`
  - `azure_devops_list_artifacts`
  - `azure_devops_list_pipelines`
  - `azure_devops_list_builds`
- Skill operating manual: `skills/azure-devops/SKILL.md`.
- Read-only prompt templates: `/ado-doctor`, `/ado-status`, `/ado-logs`,
  `/ado-artifacts`, `/ado-diagnose`.
- CLI and extension schemas currently expose `jobId` / `taskId` only. They do
  not accept `stageName` / `jobName` / `taskName`.
- Docs and prompts intentionally state that artifact download/write/extract
  and remote mutation are not implemented.
- Tests explicitly assert mutation tool names are absent from the read-only
  extension tool set.

## 2. Known remaining work

- Timeline record lookup by human-readable display names (`stageName`,
  `jobName`, `taskName`) in addition to GUID/ID selectors.
- Local artifact download/write/extract flow with preview and explicit
  confirmation.
- Remote mutation flow (`preview`, `queue`, `cancel`, `rerun`) with preview,
  explicit confirmation, and fail-closed non-interactive behavior.
- Future mutating prompt templates (`/ado-run`, `/ado-cancel`, `/ado-rerun`)
  and an optional deeper diagnosis workflow.

## 3. Sequencing decision

User-selected order:

1. Finish read-only UX (display-name selectors).
2. Local artifact download / write / extract.
3. Remote mutation with fail-closed gates.

Rationale: surface-area and blast radius grow monotonically. Read-only name
lookup adds zero side effects, local download adds filesystem writes only,
remote mutation adds side effects against Azure DevOps. Each phase must be
stable before the next begins.

---

## Phase 7A — Read-only timeline display-name selectors

Purpose: improve safe diagnostic UX before any local-write or remote-mutation
surface lands.

### Selector model

Add shared core types:

- `TimelineRecordSelector`
- `TimelineRecordCandidate`
- `TimelineRecordLookupResult`
- `TimelineNameMatchMode`

Supported selectors:

- Existing: `stageId`, `jobId`, `taskId`.
- New: `stageName`, `jobName`, `taskName`.

### Match policy

Tiered matching, evaluated in order:

1. Exact match.
2. Case-insensitive exact match.
3. Substring match.

Rules:

- If a tier produces multiple matches, return an ambiguity result with
  candidates. Do NOT fall through to a broader tier on ambiguity.
- Do NOT auto-select the first match on ambiguity.
- Distinguish three outcomes: no-match, ambiguity, successful unambiguous
  match. Each gets a distinct shape in `TimelineRecordLookupResult`.

### Log selection precedence (preserved)

For unambiguous matches, preserve existing precedence:

1. Task record log.
2. Job record log.
3. Explicit log id.
4. First listed log only when no selector was supplied, or when selector
   failure is explicitly non-fatal.

### Stage selector behavior

- Stage records may not carry log IDs.
- Use stage matches for status/evidence context only.
- Do NOT infer a child task log from a stage match unless a separate child
  traversal rule is deliberately designed and tested.

### Surfaces

- CLI flags for `status`, `logs`, `diagnose`: `--stage-name`, `--job-name`,
  `--task-name`.
- Extension inputs for `azure_devops_get_status`, `azure_devops_get_logs`,
  `azure_devops_diagnose_failure`: `stageName`, `jobName`, `taskName`.
- Skill and prompts document natural-language selector support and the
  ambiguity follow-up behavior (return candidates, ask user to disambiguate).

### Tests required

- Exact name match.
- Case-insensitive match.
- Substring match.
- Ambiguous duplicate-name match.
- No-match behavior.
- Existing GUID lookup remains supported.
- Existing task-over-job-over-explicit-over-first-log selection precedence
  remains intact.

### Critical files (Phase 7A)

- `src/core/models.ts`
- `src/core/client.ts`
- `src/core/diagnostics.ts`
- `src/cli/index.ts`
- `src/extension/schemas.ts`
- `src/extension/tools/handlers.ts`
- `skills/azure-devops/SKILL.md`
- `prompts/ado-status.md`
- `prompts/ado-logs.md`
- `prompts/ado-diagnose.md`
- `docs/api-boundary.md`
- `docs/safety.md`
- `README.md`
- `test/fixtures/timeline-get.json` (or a new dedicated selector fixture)
- `test/unit/client-timeline.test.ts`
- `test/unit/client-log-selection.test.ts`
- `test/unit/diagnostics.test.ts`
- `test/unit/cli-mock.test.ts`
- `test/unit/extension-tools.test.ts`
- `test/unit/prompt-templates.test.ts`

---

## Phase 7B — Local artifact download / write / extract

Purpose: introduce the first non-read-only capability. Local filesystem
writes only. NO remote Azure DevOps mutations.

### Requirements

- The existing artifact metadata listing remains stable; download is layered
  on top, not a replacement.
- Preview + explicit confirmation required before any file is written.
- Refuse path traversal and unsafe output paths.
- Do not overwrite existing files unless `--overwrite` (or equivalent
  explicit flag) is supplied.
- Redact signed URLs in output and errors. Signed URLs stay internal; do not
  print actionable signed URLs by default.
- Mock-mode download fixtures must land before live integration.
- Extraction is enabled only after the download path safety is tested.

### Surfaces

- CLI:
  `pi-ado artifacts download --build-id <id> --artifact-name <name> --output <path> --confirm [--extract] [--overwrite]`
- Extension tool: `azure_devops_download_artifact` with an explicit
  confirmation input.
- Prompt: update or add an artifact-download prompt only after the underlying
  CLI/tool exists.

### Critical files (Phase 7B)

- `src/core/rest.ts`
- `src/core/endpoints.ts`
- `src/core/client.ts`
- `src/core/models.ts`
- `src/cli/index.ts`
- `src/extension/schemas.ts`
- `src/extension/tools/handlers.ts`
- `src/extension/tools/index.ts`
- `docs/api-boundary.md`
- `docs/rest-api-map.md`
- `docs/safety.md`
- `skills/azure-devops/SKILL.md`
- `prompts/README.md`
- Artifact-related tests under `test/unit/`
- New artifact download fixtures under `test/fixtures/` if needed

---

## Phase 8 — Remote mutation with fail-closed gates

Purpose: introduce side-effectful Azure DevOps operations only after the
read-only selector UX and local-write safety are settled.

### Sub-sequencing

1. `preview` first.
2. `queue` only after preview body construction is deterministic and visible.
3. `cancel` with current target metadata and explicit confirmation.
4. `rerun` as new-run requeue by default. Do NOT claim UI-style failed-job
   retry unless that behavior is separately validated.

### Safety requirements

- Preview + explicit confirmation required for every remote mutation.
- Fail closed when no interactive confirmation path is available.
- Do not retry queue POSTs blindly after ambiguous network failures.
- Print resolved organization, project, pipeline/build/run id, branch/ref,
  and parameters before confirmation.
- Never pass or print secrets as runtime parameters.
- Preserve REST-first behavior. No Azure CLI fallback unless a future
  explicit decision changes this.

### Surfaces

- CLI:
  - `pi-ado run preview`
  - `pi-ado run queue`
  - `pi-ado cancel`
  - `pi-ado rerun`
- Extension tools:
  - `azure_devops_preview_run`
  - `azure_devops_queue_run`
  - `azure_devops_cancel_run`
  - `azure_devops_rerun`
- Prompt templates:
  - `/ado-run`
  - `/ado-cancel`
  - `/ado-rerun`

### Critical files (Phase 8)

- `src/core/rest.ts`
- `src/core/endpoints.ts`
- `src/core/client.ts`
- `src/core/models.ts`
- `src/cli/index.ts`
- `src/extension/schemas.ts`
- `src/extension/tools/handlers.ts`
- `src/extension/tools/index.ts`
- `package.json` (prompt registration when mutating prompts are actually
  implemented)
- `prompts/ado-run.md`
- `prompts/ado-cancel.md`
- `prompts/ado-rerun.md`
- `prompts/README.md`
- `skills/azure-devops/SKILL.md`
- `docs/api-boundary.md`
- `docs/rest-api-map.md`
- `docs/safety.md`
- New tests for preview/confirmation gates and mutation tool registration

---

## Cross-phase invariants

- REST-first; no Azure CLI fallback unless explicitly re-decided.
- No hardcoded Azure DevOps organization, project, pipeline, build, run,
  job, task, log, or token values anywhere in code, tests, prompts, or docs.
- Redaction of secrets and signed URLs in all output and errors.
- Mock-mode parity: every new live capability ships with a mock fixture path
  first, so tests exercise the surface without network.
- Tests must distinguish no-match, ambiguity, and unambiguous match for any
  selector-based code path.
- Mutation surfaces are fail-closed in non-interactive environments.

## Non-goals (for any single implementation pass unless explicitly expanded)

- Implementing timeline display-name selectors.
- Implementing artifact download/write/extract.
- Implementing queue/cancel/rerun/preview mutation tools.
- Implementing mutating prompt templates.
- Inferring or hardcoding any Azure DevOps organization, project, pipeline,
  build, run, job, task, log, or token values.

## Verification policy for plan-only passes

A pass that only updates this plan file is documentation-only. It does not
require `npm test`, `npm run typecheck`, or `npm run build`.

If a future pass modifies any source, prompt, docs, package manifest, or
test file beyond this plan, it MUST run targeted validation appropriate to
those changes and explicitly justify the scope expansion.
