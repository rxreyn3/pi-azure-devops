# AGENTS.md

## Project snapshot

`pi-azure-devops` is a Node >=20, TypeScript, ESM package for Azure DevOps diagnostics in Pi. It is intentionally REST-first and mostly read-only: CLI/core/extension status, logs, diagnostics, artifacts metadata, plus a preview-gated local artifact download/extract flow. Remote mutation operations such as queue/cancel/rerun are documented as not implemented.

Primary references observed in this repo:

- `skills/azure-devops/SKILL.md` is the operating manual for safe Azure DevOps usage.
- `.crush/skills/` contains project-local Agent Skills copied from `anthropics/skills`; Crush loads this path automatically.
- `docs/api-boundary.md` freezes public CLI/tool/prompt names and behavior contracts.
- `docs/safety.md` captures the safety boundary.
- `docs/configuration.md` documents org/project/profile/token resolution.
- `README.md` tracks currently implemented vs planned surfaces.

## Essential commands

From `package.json` and docs:

```bash
npm install
npm test
npm run typecheck
npm run build
npm run --silent spike:rest -- --mock --json
```

Useful targeted test pattern, matching the package test runner:

```bash
node --import tsx --test test/unit/<file>.test.ts
```

Script details:

- `npm test` runs `node --import tsx --test test/**/*.test.ts`.
- `npm run typecheck` runs `tsc -p tsconfig.typecheck.json`; this includes `src/**/*.ts` and `spikes/**/*.ts`, not tests.
- `npm run build` runs `tsc -p tsconfig.json`; this builds `src/**/*.ts` to `dist/`.
- No lint script was observed.

## Code organization and flow

```text
src/core/       Shared Azure DevOps auth/config/endpoints/rest/client/diagnostics/artifact logic
src/cli/        `pi-ado` command implementation, backed by core
src/extension/  Pi extension registration, TypeBox schemas, tool handlers backed by core
spikes/         REST spike using shared core
skills/         Pi skill operating manual
prompts/        Read-only prompt templates
runtime docs/   API boundary, auth/config/safety/rest mapping notes
test/unit/      Node test runner unit tests
test/fixtures/  JSON/text/base64 ZIP fixtures for mock fetch
```

Core flow:

1. `resolveAzureDevOpsConfig()` resolves org/project/profile from explicit inputs, env, project config, then user config.
2. `resolveTokenFromEnv()` finds a PAT/token from supported env vars.
3. `resolveScope()` and `buildReadOnlyEndpoints()` normalize org/project and construct Azure DevOps REST URLs.
4. `createReadOnlyRestClient()` performs bounded GET-only JSON/text/binary fetches with redacted errors.
5. `createAzureDevOpsClient()` normalizes Azure DevOps payloads into stable summaries and implements timeline/log/artifact selection helpers.
6. CLI commands and Pi extension tool handlers call the same core APIs.

When adding shared behavior, put it in `src/core/`, export it from `src/core/index.ts` if used by CLI/extension/tests, then wire the CLI and extension surfaces separately.

## Public surfaces and contracts

Implemented CLI commands observed in `src/cli/index.ts`:

- `pi-ado doctor`
- `pi-ado status`
- `pi-ado logs`
- `pi-ado diagnose`
- `pi-ado artifacts`
- `pi-ado artifacts download`

Implemented Pi extension tools observed in `src/extension/tools/index.ts`:

- Read-only: `azure_devops_doctor`, `azure_devops_get_status`, `azure_devops_get_logs`, `azure_devops_diagnose_failure`, `azure_devops_list_artifacts`, `azure_devops_list_pipelines`, `azure_devops_list_builds`
- Local-write: `azure_devops_download_artifact`

Remote mutation names are deliberately absent. Tests assert the registered tool names and order, including that mutation tools are not present.

## Safety and gotchas

- Do not add queue/cancel/rerun or arbitrary mutation passthrough behavior unless the safety contract is updated and implemented end-to-end.
- Do not invent or hardcode real org/project/pipeline/build/job/task/log identifiers. Docs explicitly require placeholders/env/config.
- Config resolution performs no Git remote inference.
- Keep PATs, auth headers, secret variable values, and signed URL secrets out of output and error text. Use existing redaction helpers at output/error sinks.
- Log output is intentionally bounded. Defaults and caps live in `src/core/limits.ts`; CLI/tools accept `maxBytes`, `startLine`, and `endLine` for targeted fetches.
- Timeline display-name selectors match exact, then case-insensitive exact, then substring. Ambiguous matches return candidates and must not auto-pick.
- Stage selectors provide status/evidence context only; they must not infer child job/task logs.
- Artifact download is local-write only and preview-first. Without `--confirm` / `confirm: true`, it writes nothing.
- Artifact output paths must remain under workspace `cwd`; absolute paths, NUL bytes, Windows drive prefixes, UNC prefixes, and traversal outside cwd are rejected.
- ZIP extraction preflights entries for Zip Slip and internal file/dir conflicts before writing.
- Pipeline artifact signed-content downloads are fetched without the Azure DevOps Authorization header.

## Mock mode and fixtures

Mock mode is first-class and avoids network/token use:

```bash
pi-ado doctor --mock --json
pi-ado status --mock --build-id 101 --json
npm run --silent spike:rest -- --mock --json
```

`src/core/mock.ts` implements fixture routing. JSON/text/binary fixture files live in `test/fixtures/`. Build ID `202` is special: it routes timeline requests to `timeline-name-selectors.json` for display-name selector and ambiguity coverage. Other build IDs use the default timeline fixture.

If you add a new REST endpoint, update fixture routing and tests so `--mock` can exercise it without credentials.

## TypeScript and style patterns

- ESM with `"type": "module"` and `moduleResolution: "NodeNext"`; relative TypeScript imports use `.js` extensions.
- Strict options include `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Existing code avoids assigning `undefined` to optional fields by using conditional spreads or helpers like `setDefined()`.
- Runtime payloads from Azure DevOps are normalized defensively from `unknown` via small helpers (`asObject`, identifier/positive-number parsing) before producing public summaries.
- CLI parsing is hand-written in `src/cli/index.ts`; there is no CLI parsing dependency observed.
- Extension schemas use `typebox`; tool implementations live in handlers and are registered with `defineTool()`.
- Tests use `node:test` and `node:assert/strict`.
- Existing comments explain security-sensitive or non-obvious behavior; do not add explanatory comments for obvious code.

## Testing expectations

For changes, run the narrowest relevant test first, then broader checks when appropriate:

- Core artifact safety/download changes: `node --import tsx --test test/unit/artifact-download.test.ts`
- CLI behavior: `node --import tsx --test test/unit/cli-mock.test.ts`
- Extension tool behavior: `node --import tsx --test test/unit/extension-tools.test.ts`
- Endpoint URL changes: `node --import tsx --test test/unit/endpoints.test.ts`
- Parsing/redaction/diagnostics changes: run the matching file in `test/unit/`

Before handing off substantive code changes, run:

```bash
npm test
npm run typecheck
npm run build
```

Docs-only changes do not affect compiled output, but the commands above are the observed project verification path.

## Adding or changing features

When adding a new capability, keep the surfaces synchronized where applicable:

1. Core implementation and exported types/models.
2. CLI command/flags and `usage()` output.
3. Extension TypeBox schema and handler.
4. Tool registration arrays and expected-name tests.
5. Mock fixture routing and fixture files.
6. Unit tests for core, CLI, and extension behavior.
7. Docs/prompts/skill updates if user-facing behavior changes.

For public names and safety categories, check `docs/api-boundary.md` before renaming or adding surfaces.
