---
description: Retrieve targeted, bounded log evidence with `pi-ado logs` and summarize key failures.
---

Use this prompt for read-only log diagnosis.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Required input:

- build ID

Optional input:

- stage hint: ID/GUID or display name
- job hint: ID/GUID or display name
- task hint: ID/GUID or display name
- explicit log ID

Behavior:

1. If build ID is missing, ask for it and stop.
2. Build command:
   - `pi-ado logs --build-id <id> --json`
   - add `--stage-id <guid>` or `--stage-name <name>` when provided
   - add `--job-id <guid>` or `--job-name <name>` when provided
   - add `--task-id <guid>` or `--task-name <name>` when provided
   - add `--log-id <id>` when provided
3. Run the command and summarize:
   - which log was selected and why (record the `resolvedLogSource`)
   - bounded error excerpts only
   - likely failing step based on evidence
4. If `pi-ado` reports missing organization/project/token configuration, ask the user to provide or configure it; do not infer it.
5. If a name selector is reported as ambiguous (multiple candidates returned in the lookup), do **not** auto-pick. Surface the candidate list and ask the user to choose a narrower selector (more specific name, an ID, or an explicit `--log-id`).
6. If no clear log target is resolved, ask the user for stage/job/task identifiers, names, or a `--log-id`.

Rules:

- Never dump huge logs verbatim.
- Prefer concise excerpts around failure signals.
- Never print secrets from logs.
- Stage selectors give context only; do not infer task/job logs from a stage match.
- Keep workflow read-only.
