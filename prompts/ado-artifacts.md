---
description: List Azure DevOps artifact metadata with `pi-ado artifacts` (no download/write in this phase).
---

Use this prompt to inspect artifact metadata for a build.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Required input:

- build ID

Behavior:

1. If build ID is missing, ask for it and stop.
2. Run `pi-ado artifacts --build-id <id> --json`.
3. If `pi-ado` reports missing organization/project/token configuration, ask the user to provide or configure it; do not infer it.
4. Summarize artifact metadata only (names/types/resource info).
5. Explicitly state that artifact download/write/extract is not implemented in this phase.

Rules:

- Treat any redacted artifact URL as non-actionable metadata.
- Do not attempt local writes.
- Do not suggest mutation workflows.
