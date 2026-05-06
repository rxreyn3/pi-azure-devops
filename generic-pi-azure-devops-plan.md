# Generic Pi Azure DevOps — Forward Plan

This is the durable forward-looking project plan for `pi-azure-devops`. It
replaces the deleted historical plan that previously lived at
`/home/ryan/dev/shotgrid-render-pipeline/generic-pi-azure-devops-plan.md`.

This document is planning only. It does not authorize source, prompt, docs,
package manifest, or test changes. Implementation of any phase below requires
an explicit follow-up session.

## 1. Current state (delivered through Phase 7D)

`pi-azure-devops` is a generic, REST-first Azure DevOps integration package
for Pi. It is not a repo-specific ShotGrid helper.

Delivered scope:

- Core modules under `src/core/`:
  - `config.ts`, `auth.ts`, `endpoints.ts`, `rest.ts`, `client.ts`,
    `models.ts`, `redact.ts`, `parsing.ts`, `scope.ts`, `mock.ts`,
    `diagnostics.ts`, `artifact-download.ts`.
  - `rest.ts` exposes GET-only JSON/text plus stream-bounded `getBinary`
    (default 100 MiB, hard cap 500 MiB; `auth: "azureDevOps" | "none"`
    so signed-content URLs receive no Authorization header). No
    POST/PATCH transport exists yet.
  - `client.ts` resolves timeline records by GUID/ID and by display name
    (`stageName` / `jobName` / `taskName`) with tiered match (exact,
    case-insensitive exact, substring) returning structured
    matched / noMatch / ambiguous / notRequested results.
    `findTimelineRecordById` is preserved for back-compat.
  - `resolveBuildLogSelection` precedence preserved: task log → job log →
    explicit log id → first listed log (only when no selector supplied).
  - `diagnostics.ts` uses the shared name/id resolver instead of duplicating
    ID-only lookup logic.
  - `artifact-download.ts` provides preview-first artifact download with
    Zip Slip protection, lstat-based per-segment symlink containment,
    same-path file/dir collision rejection, degenerate-entry rejection,
    and overwrite preflight.
- CLI `pi-ado` commands: read-only `doctor`, `status`, `logs`, `diagnose`,
  `artifacts`, plus local-write `artifacts download` (preview unless
  `--confirm`).
- Read-only extension tools:
  - `azure_devops_doctor`
  - `azure_devops_get_status`
  - `azure_devops_get_logs`
  - `azure_devops_diagnose_failure`
  - `azure_devops_list_artifacts`
  - `azure_devops_list_pipelines`
  - `azure_devops_list_builds`
- Local-write extension tool (preview-first, gated on `confirm: true`):
  - `azure_devops_download_artifact`
- Tool registration partition: `READ_ONLY_AZURE_DEVOPS_TOOLS` unchanged;
  `LOCAL_WRITE_AZURE_DEVOPS_TOOLS = [azure_devops_download_artifact]`.
- Skill operating manual: `skills/azure-devops/SKILL.md`.
- Read-only prompt templates: `/ado-doctor`, `/ado-status`, `/ado-logs`,
  `/ado-artifacts`, `/ado-diagnose`. Local-write prompt template:
  `/ado-artifacts` documents the download flow.
- CLI and extension schemas accept both ID selectors (`stageId`, `jobId`,
  `taskId`) and name selectors (`stageName`, `jobName`, `taskName`).
- Docs and prompts state that remote mutation is not implemented.
- Tests assert the read-only / local-write tool partition and that
  remote-mutation tool names remain absent.
- Package metadata is prepared for public npm publication as
  `@rxreyn3/pi-azure-devops`, with built `dist/`, skills, prompts, docs,
  examples, README, LICENSE, and CHANGELOG included by the package allow-list.
- GitHub Actions publication path is present:
  - `.github/workflows/ci.yml` verifies pushes and pull requests to `main`.
  - `.github/workflows/publish-npm.yml` publishes from GitHub releases using
    npm trusted publishing/OIDC, Node 24, `id-token: write`, and the
    `npm-production` environment gate.

## 2. Known remaining work

- Remote mutation flow (`preview`, `queue`, `cancel`, `rerun`) with preview,
  explicit confirmation, and fail-closed non-interactive behavior.
- Future mutating prompt templates (`/ado-run`, `/ado-cancel`, `/ado-rerun`)
  and an optional deeper diagnosis workflow.

## 3. Sequencing decision

User-selected order:

1. Finish read-only UX (display-name selectors). [delivered Phase 7A]
2. Local artifact download / write / extract. [delivered Phase 7B]
3. Public npm publication and OMP install testing. [delivered Phase 7C]
4. GitHub Actions trusted-publishing release pipeline. [delivered Phase 7D]
5. Remote mutation with fail-closed gates. [next: Phase 8]

Rationale: surface-area and blast radius grow monotonically. Read-only name
lookup adds zero side effects, local download adds filesystem writes only,
package publication validates installability and manual live testing before
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

## Phase 7C — Public npm publication and OMP install testing

Purpose: make the package installable from the public npm registry and prove
OMP/consumer installation before remote Azure DevOps mutation work.

### Requirements

- GitHub namespace: `rxreyn3`.
- Package name: `@rxreyn3/pi-azure-devops`.
- Publish target: public npm registry (`https://registry.npmjs.org`).
- Release automation is manual-first in this phase; the repository metadata,
  package allow-list, and local tarball validation are prepared before adding
  a dedicated GitHub Actions publish workflow.
- Do not implement remote Azure DevOps mutation commands, tools, prompts,
  transports, or behavior.
- Do not commit GitHub/npm/Azure DevOps tokens, `.env` files, tokenized
  `.npmrc` entries, or scoped registry overrides.
- Keep `dist/` ignored in git, but generate it during packing and verify the
  tarball contains built CLI/extension files.
- Package contents must include built `dist/`, `skills/`, `prompts/`, `docs/`,
  `examples/`, `README.md`, `LICENSE`, and `CHANGELOG.md`.

### Manual-first publication and install preparation

1. Prepare package metadata, lifecycle scripts, and package allow-list locally.
2. Run `npm test`, `npm run typecheck`, and `npm run build`.
3. Run `npm pack --dry-run` and inspect included/excluded files.
4. Run `npm pack`, install the generated tarball into a temporary project
   outside this repo, and smoke-test `node_modules/.bin/pi-ado doctor --mock --json`.
5. Confirm installed `package.json` still exposes `pi.extensions`, `pi.skills`,
   and `pi.prompts` metadata pointing at installed files.
6. Only after local tarball install passes, manually create/push the GitHub
   repository, authenticate to npm outside the repo if local publication is
   chosen, publish with `npm publish`, and install/test in OMP or another
   consumer project.

### Critical files (Phase 7C)

- `package.json`
- `package-lock.json`
- `package.json` publish configuration
- `.gitignore`
- `README.md`
- `docs/publication.md`
- `CHANGELOG.md`
- `generic-pi-azure-devops-plan.md`

### Verification required

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm pack --dry-run`, confirming required runtime files are included and
  `src/`, `test/`, `spikes/`, local scratch files, and secret-bearing files are excluded.
- `npm pack` followed by a temporary-project tarball install and mock CLI smoke test.

---

## Phase 7D — GitHub Actions npm trusted-publishing pipeline

Purpose: add a simple, manual-release-triggered GitHub Actions path for public
npm publication before Phase 8 remote Azure DevOps mutation work begins.

### Requirements

- Keep publication human-initiated through a GitHub release, not automatic on
  every merge.
- Use npm trusted publishing/OIDC instead of a committed `.npmrc` or
  long-lived `NPM_TOKEN` fallback.
- Use GitHub-hosted `ubuntu-latest` runners.
- Verify the package on Node 20 in CI to preserve the declared runtime floor.
- Publish on Node 24 so npm trusted-publishing requirements are satisfied.
- Set publish-job permissions to `contents: read` and `id-token: write`.
- Use the `npm-production` environment so GitHub environment protection can
  add an approval gate.
- Fail closed when the GitHub release tag is not exactly
  `v<package.json version>`.
- Fail closed when the target npm package version is already published.
- Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and
  `npm pack --dry-run` before publication.
- Publish with `npm publish --access public`.

### Critical files (Phase 7D)

- `.github/workflows/ci.yml`
- `.github/workflows/publish-npm.yml`
- `docs/publication.md`
- `README.md`
- `generic-pi-azure-devops-plan.md`

### External setup required

- Configure npm trusted publishing for package `@rxreyn3/pi-azure-devops`
  with GitHub owner/user `rxreyn3`, repository `pi-azure-devops`, workflow
  filename `publish-npm.yml`, and environment `npm-production`.
- Optionally protect the GitHub `npm-production` environment with required
  reviewers before publishing the release.

### Verification required

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm pack --dry-run`
- Workflow review confirming no committed secrets, no token fallback, release
  trigger only, minimal permissions, tag/version guard, duplicate-version
  guard, and trusted-publishing-compatible Node/npm configuration.

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
- Package distribution must be smoke-tested from an installable tarball before
  Phase 8 begins.
- No committed GitHub, npm, Azure DevOps, package registry tokens, or scoped registry overrides.
- Mutation surfaces are fail-closed in non-interactive environments.

## Non-goals (for any single implementation pass unless explicitly expanded)

- Implementing queue/cancel/rerun/preview mutation commands, tools, prompts,
  transports, or behavior during Phase 7C packaging work.
- Implementing mutating prompt templates.
- Inferring or hardcoding any Azure DevOps organization, project, pipeline,
  build, run, job, task, log, or token values.
- Committing GitHub/npm/Azure DevOps tokens, tokenized registry config, or scoped registry overrides.

## Verification policy for plan-only passes

A pass that only updates this plan file is documentation-only. It does not
require `npm test`, `npm run typecheck`, or `npm run build`.

If a future pass modifies any source, prompt, docs, package manifest, or
test file beyond this plan, it MUST run targeted validation appropriate to
those changes and explicitly justify the scope expansion.
