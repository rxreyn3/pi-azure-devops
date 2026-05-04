---
description: Run read-only Azure DevOps failure diagnostics and summarize evidence via extension tool or `pi-ado diagnose`.
---

Use this prompt to investigate a failing Azure DevOps build.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Inputs to gather:

- Azure DevOps UI URL (optional but useful)
- build ID (required)
- optional job/task/log identifiers
- optional max-bytes bound for log evidence

Behavior:

1. If a UI URL is provided, parse it for build/job/task hints.
2. If build ID is still missing or ambiguous, ask the user and stop.
3. Prefer extension tool when available:
   - `azure_devops_diagnose_failure` with `buildId`, optional `jobId`/`taskId`/`logId`, optional `maxBytes`, optional `mock`.
4. If extension tool is unavailable, use CLI fallback:
   - `pi-ado diagnose --build-id <id> --json`
   - include optional `--job-id` / `--task-id` / `--log-id` / `--max-bytes` when available.
5. If command/tool output indicates missing organization/project/token configuration, ask the user to provide/configure it; do not infer values.
6. Provide an evidence summary:
   - build status/result
   - failed/canceled timeline evidence and issue messages
   - bounded log excerpts around error/warning/failure markers
   - artifact metadata context (no download)
   - confidence level and missing information

Rules:

- Ask for missing required fields instead of guessing.
- Keep all actions read-only.
- Do not suggest queue/cancel/rerun.
- Do not attempt artifact download/write/extract.
