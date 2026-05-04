# Migration: Spike → Core → CLI → Extension

## Purpose

Keep one REST behavior path while evolving delivery surfaces.

## Stage status

1. **Spike (`spikes/ado-rest-spike.ts`)** ✅
   - Read-only endpoint verification.
   - Mock/no-network mode with checked-in fixtures.
   - Timeline job/task GUID → numeric log ID mapping.

2. **Core library (`src/core/`)** ✅ (initial)
   - Auth/env token lookup + Basic auth helpers.
   - Config resolution from explicit/env/config files.
   - Endpoint builders and organization URL normalization.
   - Read-only REST transport with timeout/bounded text/redacted errors.
   - Typed models and read-only `AzureDevOpsClient` methods.

3. **CLI helper (`src/cli/`)** ✅ (read-only)
   - `pi-ado doctor`
   - `pi-ado status`
   - `pi-ado logs`
   - `pi-ado diagnose`
   - `pi-ado artifacts`
   - `--mock` support for no-network validation.

4. **Skill operating manual (`skills/azure-devops/SKILL.md`)** ✅
   - Current operating source of truth for read-only diagnostic behavior and safety rules.

5. **Prompt templates (`prompts/*.md`)** ✅ (read-only set)
   - `/ado-doctor`, `/ado-status`, `/ado-logs`, `/ado-artifacts`, `/ado-diagnose`
   - Templates wrap current `pi-ado` read-only commands and explicitly avoid mutation/file-write flows.

6. **Pi extension tools (`src/extension/tools/`)** ✅ (read-only set)
   - Implemented read-only tools backed by `src/core` only:
     - `azure_devops_doctor`
     - `azure_devops_get_status`
     - `azure_devops_get_logs`
     - `azure_devops_diagnose_failure`
     - `azure_devops_list_artifacts`
     - `azure_devops_list_pipelines`
     - `azure_devops_list_builds`
   - Mutating extension tools remain pending.

## Guardrails

- No org/project/pipeline hardcoding at any stage.
- No side-effectful behavior introduced before safety contracts are implemented.
- Keep docs explicit that read-only prompts and read-only extension tools are implemented, while mutating tools/prompts remain pending.
- Avoid API drift by treating `docs/api-boundary.md` as compatibility source of truth.
