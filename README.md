# pi-azure-devops

Generic, REST-first Azure DevOps package workspace for Pi.

## Current status

Implemented now:

- Reusable read-only core modules in `src/core/`:
  - `auth.ts`, `config.ts`, `endpoints.ts`, `rest.ts`, `models.ts`, `client.ts`
  - shared helpers: `redact.ts`, `parsing.ts`, `scope.ts`, `mock.ts`, `errors.ts`
- Refactored REST spike: `spikes/ado-rest-spike.ts` now uses the shared core.
- Read-only CLI surface in `src/cli/index.ts` (`doctor`, `status`, `logs`, `diagnose`, `artifacts`).
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

Not implemented yet:

- Mutating queue/cancel/rerun commands.
- Artifact download/write/extract flows.
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
pi-ado status --build-id <id> [--job-id <guid>] [--task-id <guid>] [--json] [--mock]
pi-ado logs --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--json] [--mock]
pi-ado diagnose --build-id <id> [--job-id <guid>] [--task-id <guid>] [--log-id <id>] [--max-bytes <n>] [--json] [--mock]
pi-ado artifacts --build-id <id> [--json] [--mock]
```

`--mock` runs with local fixtures and no network/token.

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
