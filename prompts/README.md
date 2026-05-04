# Prompt templates

Implemented read-only templates:

- `ado-doctor.md`
- `ado-status.md`
- `ado-logs.md`
- `ado-artifacts.md`
- `ado-diagnose.md`

These templates wrap the currently implemented `pi-ado` read-only CLI behavior and follow `skills/azure-devops/SKILL.md`. The package also exposes read-only extension tools for the same diagnostic scope (including `azure_devops_diagnose_failure`); mutating extension tools remain pending.

The package manifest registers the `ado-*.md` prompt files explicitly so this README is documentation only, not a slash prompt.

Pending future templates (not implemented in this phase):

- mutating workflows (`ado-run`, `ado-cancel`, `ado-rerun`)
- deep/extended diagnose workflows beyond current read-only surface
