---
description: Summarize build status and timeline hints using `pi-ado status` in read-only mode.
---

Use this prompt to inspect a specific build.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Required input:

- build ID

Optional input:

- job ID hint
- task ID hint

Behavior:

1. If build ID is missing, ask the user for it and stop.
2. Build command:
   - `pi-ado status --build-id <id> --json`
   - add `--job-id <guid>` when provided
   - add `--task-id <guid>` when provided
3. Run the command and summarize:
   - build state/result
   - timeline summary of failed/in-progress records
   - selected log hint from timeline mapping
4. If `pi-ado` reports missing organization/project/token configuration, ask the user to provide or configure it; do not infer it.
5. If selection is ambiguous or missing, ask the user for a narrower target.

Rules:

- Never invent build/job/task IDs.
- Keep output concise and diagnostic-focused.
- Do not propose mutation workflows in this phase.
