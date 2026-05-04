# REST API Map (Phase 0 hardened)

Status legend:

- `verified`: exercised against Azure DevOps Services in live read-only spike.
- `mocked-only`: exercised in `--mock` fixture mode only.
- `deferred-with-rationale`: intentionally not implemented in this phase.
- `unverified`: planned but not yet exercised.

## Scope assumptions

- Service target: Azure DevOps Services (`https://dev.azure.com/{organization}`).
- Auth: PAT/token via Basic auth (`":" + token`), with token value never printed.
- Read-only operations are implemented now; mutating operations remain deferred by design.

## Read-only endpoints currently exercised by `spikes/ado-rest-spike.ts` and `src/core/client.ts`

| Operation | Endpoint template | API version | Status | Notes |
|---|---|---:|---|---|
| List pipelines | `/{project}/_apis/pipelines?$top={top}` | `7.1` | `verified` | Used for candidate `pipelineId` discovery. |
| List builds | `/{project}/_apis/build/builds?$top={top}&queryOrder=queueTimeDescending` | `7.1` | `verified` | Used for candidate `buildId` discovery. |
| Get build | `/{project}/_apis/build/builds/{buildId}` | `7.1` | `verified` | Build detail shape differs by pipeline/definition type. |
| Get pipeline run | `/{project}/_apis/pipelines/{pipelineId}/runs/{runId}` | `7.1` | `verified` | Live read-only check passed when supplied explicit `pipelineId` + `runId`. Build IDs may coincide with run IDs for some YAML pipelines, but callers should not assume that without verification. |
| Get timeline (build) | `/{project}/_apis/build/builds/{buildId}/timeline` | `7.1` | `verified` | Spike now parses `records[]` and fallback `value[]`; summarizes failures/warnings/problems and job/task matches. |
| List build logs | `/{project}/_apis/build/builds/{buildId}/logs` | `7.1` | `verified` | Log selection now prefers timeline-matched task/job log IDs when available. |
| Get build log content | `/{project}/_apis/build/builds/{buildId}/logs/{logId}` | `7.1` | `verified` | Bounded fetch (`maxBytes=8000`) retained. |
| List build artifacts | `/{project}/_apis/build/builds/{buildId}/artifacts` | `7.1` | `verified` | Listing only; no download/write behavior in current phase. |

### Live verification note (read-only)

Recent live runs using env-driven org/project values verified all 8 read-only operations. Timeline GUID mapping resolved a numeric log ID from matched task timeline data and successfully fetched that log. A separate read-only check verified the Pipelines API `getRun` endpoint when explicit `pipelineId` + `runId` were supplied.

## Mutating operations intentionally deferred (safety-first)

| Operation | Candidate endpoint template | API version | Status | Rationale |
|---|---|---:|---|---|
| Queue build (Build API) | `/{project}/_apis/build/builds` (POST) | `7.1` | `deferred-with-rationale` | Remote mutation; requires preview + explicit confirmation contract before implementation. |
| Queue run (Pipelines API) | `/{project}/_apis/pipelines/{pipelineId}/runs` (POST) | `7.1` | `deferred-with-rationale` | Remote mutation; blocked until safety gates are implemented. |
| Preview run | `/{project}/_apis/pipelines/{pipelineId}/runs?previewRun=true` (POST) | `7.1` / preview | `deferred-with-rationale` | Needs explicit preview semantics and live endpoint-specific verification by pipeline type. |
| Cancel build/run | Build/Pipelines cancel endpoint(s) | TBD | `deferred-with-rationale` | Side-effectful; idempotency/terminal-state behavior to be validated later. |
| Rerun/retry failed jobs | API-specific rerun/retry endpoint(s) | TBD | `deferred-with-rationale` | Semantics vary by API and pipeline type; deferred until mutation phase. |

## Pagination / continuation notes (Phase 0)

| Operation | Pagination style | Status |
|---|---|---|
| Pipelines list | `$top`; continuation-token behavior not yet validated in spike | `unverified` |
| Builds list | `$top`; continuation-token headers not yet surfaced in spike | `unverified` |
| Logs list | Per-build log list; no continuation handling currently required in observed runs | `verified` |

## Current CLI read-only surface (`pi-ado`)

- `pi-ado doctor`: config/auth readiness only (no REST call required).
- `pi-ado status --build-id`: calls getBuild + getTimeline + listLogs/timeline matching.
- `pi-ado logs --build-id`: calls listLogs, resolves log selection precedence, then getLog.
- `pi-ado diagnose --build-id`: bundles getBuild + getTimeline + listLogs + selected getLog + listArtifacts with bounded excerpts.
- `pi-ado artifacts --build-id`: calls listArtifacts.

## Auth and scope notes

Token env precedence in spike/core:

1. `PI_AZURE_DEVOPS_PAT`
2. `PI_ADO_PAT`
3. `AZURE_DEVOPS_PAT`
4. `AZURE_DEVOPS_EXT_PAT`
5. `ADO_PAT`
6. `SYSTEM_ACCESSTOKEN`

PAT scope sufficiency is checked operationally (successful endpoint calls), not by direct scope introspection.
