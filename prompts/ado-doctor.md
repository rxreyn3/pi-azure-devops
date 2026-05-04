---
description: Check Azure DevOps read-only readiness (config + auth) using `pi-ado doctor`, with safe missing-info guidance.
---

Use this prompt for read-only setup checks.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

Behavior:

1. Ask whether the user wants mock mode or live checks.
2. If the user asks for mock mode, run `pi-ado doctor --mock --json`.
3. Otherwise run `pi-ado doctor --json`.
4. Summarize:
   - resolved non-secret config fields
   - token presence/source state
   - warnings and what is missing
5. If required config is missing (organization/project/token), ask for it explicitly.

Rules:

- Keep everything read-only.
- Never print token values or auth headers.
- Never guess organization/project values.
- Do not suggest queue/cancel/rerun or artifact download/write in this phase.
