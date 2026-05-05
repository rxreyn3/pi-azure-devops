# Prompt templates

Implemented read-only templates:

- `ado-doctor.md`
- `ado-status.md`
- `ado-logs.md`
- `ado-artifacts.md`
- `ado-diagnose.md`

These templates wrap the currently implemented `pi-ado` CLI behavior (read-only commands plus the Phase 7B preview-first local artifact download) and follow `skills/azure-devops/SKILL.md`. The package also exposes:

- Read-only extension tools (including `azure_devops_diagnose_failure`).
- A local-write extension tool: `azure_devops_download_artifact` (preview-first; writes only with `confirm: true`).

The `/ado-artifacts` template covers both the metadata listing and the local artifact download / extract flow with explicit confirmation.

The package manifest registers the `ado-*.md` prompt files explicitly so this README is documentation only, not a slash prompt.

Pending future templates (not implemented in this phase):

- Remote-mutation workflows (`ado-run`, `ado-cancel`, `ado-rerun`)
- Deep/extended diagnose workflows beyond the current read-only diagnose surface