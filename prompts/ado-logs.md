---
description: Retrieve targeted, bounded log evidence with `pi-ado logs` and summarize key failures.
---

Use this prompt for read-only log diagnosis.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Required input:

- build ID

Optional input:

- job ID hint
- task ID hint
- explicit log ID

Behavior:

1. If build ID is missing, ask for it and stop.
2. Build command:
   - `pi-ado logs --build-id <id> --json`
   - add `--job-id <guid>` when provided
   - add `--task-id <guid>` when provided
   - add `--log-id <id>` when provided
3. Run the command and summarize:
   - which log was selected and why
   - bounded error excerpts only
   - likely failing step based on evidence
4. If `pi-ado` reports missing organization/project/token configuration, ask the user to provide or configure it; do not infer it.
5. If no clear log target is resolved, ask the user for job/task/log identifiers.

Rules:

- Never dump huge logs verbatim.
- Prefer concise excerpts around failure signals.
- Never print secrets from logs.
- Keep workflow read-only.
