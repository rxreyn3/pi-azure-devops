---
description: Summarize build status and timeline hints using `pi-ado status` in read-only mode.
---

Use this prompt to inspect a specific build.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Required input:

- build ID

Optional input:

- stage hint: ID/GUID or display name
- job hint: ID/GUID or display name
- task hint: ID/GUID or display name

Behavior:

1. If build ID is missing, ask the user for it and stop.
2. Build command:
   - `pi-ado status --build-id <id> --json`
   - add `--stage-id <guid>` or `--stage-name <name>` when provided
   - add `--job-id <guid>` or `--job-name <name>` when provided
   - add `--task-id <guid>` or `--task-name <name>` when provided
3. Run the command and summarize:
   - build state/result
   - timeline summary of failed/in-progress records
   - selected log hint from timeline mapping
   - matched stage/job/task records from the selector lookup
4. If `pi-ado` reports missing organization/project/token configuration, ask the user to provide or configure it; do not infer it.
5. If a name selector is reported as ambiguous (multiple candidates in the lookup), do **not** auto-pick. Show the candidate list back to the user and ask for a narrower selector (more specific name, ID, or `--log-id`).
6. If selection is missing or no log was selected, ask the user for a narrower target.

Rules:

- Never invent build/stage/job/task IDs or names.
- Stage selectors are status/evidence context only; never derive a child task/job log from a stage match.
- Keep output concise and diagnostic-focused.
- Do not propose mutation workflows in this phase.
