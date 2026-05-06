# pi-azure-devops

Azure DevOps diagnostics for Pi and OMP.

Use your coding agent to inspect Azure DevOps builds, fetch bounded logs, list artifacts, and safely preview artifact downloads without giving the agent Azure DevOps mutation powers.

## What you can do

- Check Azure DevOps configuration and token readiness.
- Inspect build status and timeline failures.
- Fetch logs by build, stage, job, task, or explicit log ID.
- Diagnose failed builds with timeline issues and selected log evidence.
- List recent pipelines, recent builds, and build artifacts.
- Preview artifact downloads before writing anything locally.
- Run mock diagnostics with no network access and no token.

## Safety model

This package is intentionally conservative:

- Azure DevOps operations are read-only: no queue, cancel, rerun, approval, or remote mutation APIs are exposed.
- Artifact download is local-write only. It writes under the current workspace only after an explicit confirmation flag or `confirm: true`.
- Artifact download previews write nothing.
- Output paths reject absolute paths, traversal outside the workspace, Windows drive prefixes, UNC prefixes, and NUL bytes.
- ZIP extraction preflights entries for Zip Slip and file/directory conflicts before writing.
- PATs, auth headers, and signed URL secrets are redacted from output and errors.
- Pipeline artifact signed URLs are fetched without the Azure DevOps Authorization header.
- Mock mode uses local fixtures and does not require credentials.

## Install in OMP

```bash
omp plugin install @rxreyn3/pi-azure-devops
omp plugin doctor --json
```

Then start OMP and ask for an Azure DevOps diagnostic task. For example:

```text
Use the Azure DevOps extension in mock mode to diagnose build 101 and summarize the failed task.
```

```text
Use Azure DevOps diagnostics to list artifacts for build 101 in mock mode. Do not download anything.
```

## Install in Pi

Pi package installs use the npm source prefix:

```bash
pi install npm:@rxreyn3/pi-azure-devops
```

To try the package for one run without adding it to settings:

```bash
pi -e npm:@rxreyn3/pi-azure-devops
```

## What this adds to Pi/OMP

Installing the package registers these resources from `package.json`:

| Resource | What it provides |
| --- | --- |
| Extension | Azure DevOps tools callable by the agent |
| Skill | Safe Azure DevOps operating rules and missing-info behavior |
| Prompt templates | Reusable `ado-*` workflows for doctor, status, logs, artifacts, and diagnose tasks |
| CLI | `pi-ado`, a standalone command line interface for the same core operations |

The extension tools are:

| Tool | Purpose |
| --- | --- |
| `azure_devops_doctor` | Check resolved config and auth readiness |
| `azure_devops_get_status` | Fetch build status and timeline summary |
| `azure_devops_get_logs` | Fetch bounded selected log content |
| `azure_devops_diagnose_failure` | Collect failure evidence from status, timeline, logs, and artifact metadata |
| `azure_devops_list_artifacts` | List build artifact metadata |
| `azure_devops_list_pipelines` | List recent pipeline summaries |
| `azure_devops_list_builds` | List recent build summaries |
| `azure_devops_download_artifact` | Preview or confirm a local artifact ZIP download/extract |

## First run without credentials

Use mock mode to verify the package and see the shape of responses without touching Azure DevOps:

```bash
pi-ado doctor --mock --json
pi-ado status --mock --build-id 101 --json
pi-ado diagnose --mock --build-id 101 --json
```

Mock mode is also useful inside Pi/OMP prompts:

```text
Use Azure DevOps diagnostics in mock mode to explain build 101.
```

## Configure Azure DevOps access

Live Azure DevOps calls need an organization, project, and token. The fastest setup is environment variables:

```bash
export PI_AZURE_DEVOPS_ORGANIZATION="<your-org-or-url>"
export PI_AZURE_DEVOPS_PROJECT="<your-project>"
export PI_AZURE_DEVOPS_PAT="<your-pat>"
```

Supported token environment variables, in lookup order:

1. `PI_AZURE_DEVOPS_PAT`
2. `PI_ADO_PAT`
3. `AZURE_DEVOPS_PAT`
4. `AZURE_DEVOPS_EXT_PAT`
5. `ADO_PAT`
6. `SYSTEM_ACCESSTOKEN`

For file-based profiles and the full resolution order, see `docs/configuration.md`.

## Common agent requests

After installation, ask Pi/OMP for the outcome you want rather than for a specific REST call:

```text
Diagnose Azure DevOps build 12345 and explain the most likely failure cause.
```

```text
Fetch the log for task name "Build" in Azure DevOps build 12345. Keep the output bounded.
```

```text
List artifacts for Azure DevOps build 12345 and tell me which one looks like the drop artifact.
```

```text
Preview downloading artifact "drop" from build 12345 to artifacts/drop.zip. Do not confirm the write.
```

```text
Download artifact "drop" from build 12345 to artifacts/drop.zip only after showing me the preview and asking for confirmation.
```

## CLI reference

The `pi-ado` CLI is available for shell workflows and for smoke testing outside the agent.

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
  [--log-id <id>] [--max-bytes <n>] \
  [--start-line <n>] [--end-line <n>] \
  [--json] [--mock]

pi-ado diagnose --build-id <id> \
  [--stage-id <guid>] [--stage-name <name>] \
  [--job-id <guid>] [--job-name <name>] \
  [--task-id <guid>] [--task-name <name>] \
  [--log-id <id>] [--max-bytes <n>] \
  [--start-line <n>] [--end-line <n>] \
  [--json] [--mock]

pi-ado artifacts --build-id <id> [--json] [--mock]
```

### Timeline display-name selectors

`status`, `logs`, and `diagnose` accept human-readable selectors in addition to ID/GUID selectors:

- CLI: `--stage-name`, `--job-name`, `--task-name`
- Extension tools: `stageName`, `jobName`, `taskName`

Name matching is exact, then case-insensitive exact, then substring. Ambiguous matches return candidates and do not auto-pick a record. Stage selectors provide status/evidence context only; they do not infer a child job/task log.

### Local artifact download

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
- `--artifact-kind auto` checks both Build Artifacts and Pipelines Artifacts APIs. If both match, the preview reports `ambiguous` and refuses to write.
- Pipeline-source resolution defaults `pipelineId = build.definitionId` and `runId = buildId`; pass `--pipeline-id` / `--run-id` when auto-inference is not enough.
- Existing files are never overwritten without `--overwrite`.

## Local development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run --silent spike:rest -- --mock --json
```

`npm run build` generates the `dist/` files used by the CLI binary and Pi extension metadata. `dist/` stays gitignored and is regenerated by `prepack` for package tarballs.

## Package and publication notes

- Published npm package: `@rxreyn3/pi-azure-devops`
- No custom registry mapping is required.
- GitHub Actions button publication and live-install steps are documented in `docs/publication.md`.
- Staged implementation history lives in `generic-pi-azure-devops-plan.md`.
