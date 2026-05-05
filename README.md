# pi-azure-devops

Generic, REST-first Azure DevOps package workspace for Pi.

## Current status

Implemented now:

- Reusable read-only core modules in `src/core/`:
  - `auth.ts`, `config.ts`, `endpoints.ts`, `rest.ts`, `models.ts`, `client.ts`
  - shared helpers: `redact.ts`, `parsing.ts`, `scope.ts`, `mock.ts`, `errors.ts`
- Refactored REST spike: `spikes/ado-rest-spike.ts` now uses the shared core.
- Read-only CLI surface in `src/cli/index.ts` (`doctor`, `status`, `logs`, `diagnose`, `artifacts`).
- Phase 7B local-write CLI surface in `src/cli/index.ts` (`artifacts download`).
- Phase 3 skill operating manual in `skills/azure-devops/SKILL.md`.
- Phase 4 read-only prompt templates in `prompts/`:
  - `ado-doctor.md`
  - `ado-status.md`
  - `ado-logs.md`
  - `ado-artifacts.md`
  - `ado-diagnose.md`
- Phase 6A read-only Pi extension tools in `src/extension/`:
  - `azure_devops_doctor`
  - `azure_devops_get_status`
  - `azure_devops_get_logs`
  - `azure_devops_diagnose_failure`
  - `azure_devops_list_artifacts`
  - `azure_devops_list_pipelines`
  - `azure_devops_list_builds`
- Phase 7B local-write Pi extension tool:
  - `azure_devops_download_artifact` (preview-first; writes only with `confirm: true`)

Not implemented yet:

- Mutating queue/cancel/rerun commands.
- Mutating extension tools (`azure_devops_preview_run`, `azure_devops_queue_run`, `azure_devops_cancel_run`, `azure_devops_rerun`).
- Mutating prompt templates (`ado-run`, `ado-cancel`, `ado-rerun`).
## Operating manual

Use `skills/azure-devops/SKILL.md` as the source-of-truth operating manual for safe usage patterns, missing-info behavior, and current read-only command scope.

## Install

```bash
npm install
```

## Scripts

```bash
npm test
npm run typecheck
npm run build
npm run --silent spike:rest -- --mock --json
```

## CLI (`pi-ado`) read-only commands

```bash
pi-ado doctor [--json] [--mock]
pi-ado status --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--json] [--mock]
pi-ado logs --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--log-id <id>] [--json] [--mock]
pi-ado diagnose --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--log-id <id>] [--max-bytes <n>] [--json] [--mock]
pi-ado artifacts --build-id <id> [--json] [--mock]
```

`--mock` runs with local fixtures and no network/token.

### Timeline display-name selectors (Phase 7A)

`status`, `logs`, and `diagnose` accept human-readable display-name selectors in addition to ID/GUID selectors:

- `--stage-name`, `--job-name`, `--task-name` for CLI.
- `stageName`, `jobName`, `taskName` on the matching extension tools (`azure_devops_get_status`, `azure_devops_get_logs`, `azure_devops_diagnose_failure`).

Name match policy, in order:

1. Exact match.
2. Case-insensitive exact match.
3. Substring match.

If a tier returns multiple matches, the response includes a candidate list with status `ambiguous` and does not auto-pick a record. Ambiguous or non-matching selectors do not fall back to the first available log; ask for a narrower selector or supply `--log-id`.

Stage selectors are status/evidence context only and never infer a child task/job log.

### Local artifact download (Phase 7B)

`pi-ado artifacts download` is the first non-read-only capability in this package. It writes a local file (or extracts a ZIP) under the workspace `cwd`. It does **not** mutate Azure DevOps state.

```bash
pi-ado artifacts download \
  --build-id <id> \
  --artifact-name <name> \
  --output <relative-path> \
  [--artifact-kind auto|build|pipeline] \
  [--pipeline-id <id>] [--run-id <id>] \
  [--max-bytes <n>] \
  [--confirm] [--extract] [--overwrite] \
  [--json] [--mock]
```

Behavior:

- Without `--confirm`, the command prints a preview and writes nothing.
- With `--confirm`, it downloads the artifact ZIP. Add `--extract` to extract entries into the destination directory.
- The default `--artifact-kind auto` resolves the source against both Build Artifacts and Pipelines Artifacts APIs; if both match, the preview reports `ambiguous` and refuses to write.
- Pipeline-source resolution defaults `pipelineId = build.definitionId`, `runId = buildId`. Pass `--pipeline-id` / `--run-id` when auto-inference cannot resolve a pipeline source.
- Output paths must be relative to the workspace, contain no NUL bytes, no Windows drive or UNC prefixes, and never escape the workspace via `..`.
- Existing files are never overwritten without `--overwrite`. ZIP extraction preflights every entry against the destination and refuses Zip Slip.
- Signed artifact URLs are redacted in output and never fetched with the Azure DevOps PAT header.

## REST spike usage

```bash
# no-network mock mode
npm run --silent spike:rest -- --mock --json

# live read-only mode (requires explicit org/project and token env)
PI_AZURE_DEVOPS_PAT="<your-pat>" \
  npm run --silent spike:rest -- \
    --organization "<your-org-or-url>" \
    --project "<your-project>" \
    --top 3 \
    --json
```

Supported token env vars (first found wins):

1. `PI_AZURE_DEVOPS_PAT`
2. `PI_ADO_PAT`
3. `AZURE_DEVOPS_PAT`
4. `AZURE_DEVOPS_EXT_PAT`
5. `ADO_PAT`
6. `SYSTEM_ACCESSTOKEN`

The package redacts token/auth patterns and signed URL query secrets at output/error sinks, and never intentionally prints PAT values.

## Layout

```text
spikes/
src/core/
src/cli/
src/extension/
docs/
examples/
test/
```

See `docs/migration-helper-to-extension.md` for staged evolution from spike → core → CLI → extension.
