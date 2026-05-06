# npm publication runbook

This runbook validates and publishes `@rxreyn3/pi-azure-devops` to the public npm registry from a manually dispatched GitHub Actions workflow using npm trusted publishing. Publication is button-triggered and environment-gated; Azure DevOps remote queue/cancel/rerun mutation work remains out of scope.

## Safety boundaries

- Do not implement or expose Azure DevOps queue/cancel/rerun/preview mutation commands, tools, prompts, or transports as part of publication.
- Do not commit npm tokens, GitHub tokens, Azure DevOps PATs, `.env` files, or tokenized `.npmrc` entries.
- Do not add a committed registry override for `@rxreyn3`; consumers should be able to run plain `npm install @rxreyn3/pi-azure-devops` from the public npm registry.
- Use npm trusted publishing/OIDC for GitHub Actions publication. Do not add an `NPM_TOKEN` fallback unless trusted publishing is explicitly rejected in a future decision.
- Keep any manual npm authentication in user-level config, a temporary shell environment, or another environment-specific secret store outside the repo.
- Do not paste tokens into logs, docs examples, package metadata, workflow text, or issue text.
- Existing signed Azure DevOps artifact URL redaction and PAT-handling rules remain unchanged.

## GitHub Actions publication pipeline

The repository contains two workflows:

- `.github/workflows/ci.yml` runs on pushes and pull requests to `main` with Node 20. It runs `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and `npm pack --dry-run`.
- `.github/workflows/publish-npm.yml` is manually started with GitHub Actions `workflow_dispatch`. It requires a `patch`, `minor`, or `major` bump choice, runs only from `main`, uses Node 24, has GitHub OIDC permission `id-token: write`, uses environment `npm-production`, bumps and commits `package.json` / `package-lock.json`, creates and pushes the matching `vX.Y.Z` tag atomically, runs the same verification gates as CI, checks npm for duplicate versions, and publishes with `npm publish --access public`.

The publish workflow commits no `.npmrc` and uses no long-lived npm token. npm trusted publishing must be configured on npm before using the button workflow.

## One-time external setup

1. Confirm the GitHub repository exists and is pushed: `rxreyn3/pi-azure-devops`.
2. In GitHub, optionally create an environment named `npm-production` and add required reviewers. If configured, this adds a manual approval gate before the publish job runs.
3. On npmjs.com, configure trusted publishing for package `@rxreyn3/pi-azure-devops`:

   - Publisher: GitHub Actions
   - Organization or user: `rxreyn3`
   - Repository: `pi-azure-devops`
   - Workflow filename: `publish-npm.yml`
   - Environment name: `npm-production`

4. Leave token publishing disabled for the workflow. If trusted publishing is unavailable for this package/account, stop and choose explicitly between protected-token publication and the manual local flow; do not silently add a token fallback.

## Button publication flow

1. Merge normal development through pull requests to `main`.
2. Wait for `CI` to pass on `main`.
3. Open the GitHub Actions workflow: `Publish npm package`.
4. Select `Run workflow` on branch `main`.
5. Choose the version bump:

   - `patch` for compatible fixes and small improvements.
   - `minor` for backward-compatible feature additions.
   - `major` for breaking changes.

6. Start the workflow.
7. If `npm-production` has required reviewers, approve the environment deployment only after confirming the selected bump and current `main` state.
8. Let the workflow complete. It must fail closed if it is not run from `main`, if the computed package version is already published, if the matching Git tag already exists, or if verification fails.

The workflow performs these actions after approval:

1. Installs dependencies with `npm ci`.
2. Runs `npm version <bump> --no-git-tag-version`.
3. Verifies the computed `@rxreyn3/pi-azure-devops@X.Y.Z` version is unpublished.
4. Verifies tag `vX.Y.Z` does not already exist.
5. Runs `npm test`, `npm run typecheck`, `npm run build`, and `npm pack --dry-run`.
6. Commits `package.json` and `package-lock.json` with message `Bump package version to X.Y.Z`.
7. Tags the same commit as `vX.Y.Z` and pushes the commit and tag atomically.
8. Publishes to npm with trusted publishing/OIDC.

Do not create a separate manual version-bump commit or GitHub release for routine publication. Use the button workflow so the version bump, tag, verification, and npm publish stay in one audited run.

## Post-publication verification

1. Confirm npm reports the published version:

   ```bash
   npm view @rxreyn3/pi-azure-devops version --registry=https://registry.npmjs.org/
   ```

2. In a fresh consumer project, install and smoke-test from the public registry:

   ```bash
   npm install @rxreyn3/pi-azure-devops
   ./node_modules/.bin/pi-ado doctor --mock --json
   ```

3. In OMP, install and smoke-test the plugin:

   ```bash
   omp plugin install @rxreyn3/pi-azure-devops
   omp plugin doctor --json
   pi-ado doctor --mock --json
   ```

4. Run live checks only with existing read-only or local-write-gated operations:

   - Read-only diagnostics/status/log/artifact metadata commands.
   - Artifact download preview without `--confirm` first.
   - Local artifact download/extract only after reviewing preview and supplying the explicit confirmation flag.

Do not proceed to Phase 8 remote mutation work until the GitHub Actions publication job and public-registry OMP/consumer install checks have passed.