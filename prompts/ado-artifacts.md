---
description: List Azure DevOps artifact metadata and preview-first local artifact downloads with `pi-ado artifacts` (preview-first; downloads only on explicit confirm).
---

Use this prompt to inspect artifact metadata for a build, and optionally to download a single artifact ZIP locally with explicit confirmation.

Follow `skills/azure-devops/SKILL.md` as the operating manual.

## Required input

- build ID
- artifact name (only for download flows)
- output path (only for download flows; relative to the workspace)

## List metadata only (default)

Behavior:

1. If build ID is missing, ask for it and stop.
2. Run `pi-ado artifacts --build-id <id> --json`.
3. If `pi-ado` reports missing organization/project/token configuration, ask the user to provide or configure it; do not infer it.
4. Summarize artifact metadata only (names/types/resource info).
5. Treat any redacted artifact URL as non-actionable metadata.

## Local artifact download (preview + confirm)

Artifact download/write is a **local file write** capability. It is **not** a remote mutation. It still requires preview + explicit confirmation.

Behavior:

1. If build ID, artifact name, or output path is missing, ask for the missing value and stop.
2. Run preview first (omit `--confirm`):
   - `pi-ado artifacts download --build-id <id> --artifact-name <name> --output <relative-path> --json`
3. Show the preview to the user. The preview reports the resolved artifact source (`build` vs `pipeline`), output target, extract/overwrite intent, and any ambiguity or unresolved-source message.
4. If the resolution is `ambiguous`, do **not** auto-pick. Ask the user whether to use Build Artifacts or Pipeline Artifacts and pass `--artifact-kind build|pipeline`.
5. If pipeline-source resolution failed, ask the user for `--pipeline-id` and `--run-id`.
6. Re-run with `--confirm` only after the user confirms. Add `--extract` to extract the ZIP, and `--overwrite` to allow replacing existing files.
7. After the write, report the bytes written and the relative paths under the workspace.

Source-selection flags:

- `--artifact-kind auto|build|pipeline` (default `auto`)
- `--pipeline-id <id>`, `--run-id <id>` (only needed for the Pipelines Artifacts API when auto inference cannot resolve them)

## Rules

- Treat any redacted artifact URL as non-actionable metadata. Signed URLs are never printed.
- Refuse output paths that are absolute, contain NUL bytes, use Windows drive or UNC prefixes, or escape the workspace via `..`.
- Refuse to overwrite existing files unless the user passes `--overwrite`.
- Never send the Azure DevOps PAT to the signed-content URL of a pipeline artifact.
- Do not suggest remote mutation workflows (queue/cancel/rerun).
