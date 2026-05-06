# npm publication runbook

This runbook validates and publishes `@rxreyn3/pi-azure-devops` to the public npm registry from GitHub Actions using npm trusted publishing. Publication remains manual-triggered by a GitHub release; Azure DevOps remote queue/cancel/rerun mutation work remains out of scope.

## Safety boundaries

- Do not implement or expose Azure DevOps queue/cancel/rerun/preview mutation commands, tools, prompts, or transports as part of publication.
- Do not commit npm tokens, GitHub tokens, Azure DevOps PATs, `.env` files, or tokenized `.npmrc` entries.
- Do not add a committed registry override for `@rxreyn3`; consumers should be able to run plain `npm install @rxreyn3/pi-azure-devops` from the public npm registry.
- Use npm trusted publishing/OIDC for GitHub Actions publication. Do not add an `NPM_TOKEN` fallback unless trusted publishing is explicitly rejected in a future decision.
- Keep any manual npm authentication in user-level config, a temporary shell environment, or another environment-specific secret store outside the repo.
- Do not paste tokens into logs, docs examples, package metadata, release text, or issue text.
- Existing signed Azure DevOps artifact URL redaction and PAT-handling rules remain unchanged.

## GitHub Actions release pipeline

The repository contains two workflows:

- `.github/workflows/ci.yml` runs on pushes and pull requests to `main` with Node 20. It runs `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and `npm pack --dry-run`.
- `.github/workflows/publish-npm.yml` runs only when a GitHub release is published. It uses Node 24, GitHub OIDC permission `id-token: write`, environment `npm-production`, the same verification gates as CI, a release-tag/package-version check, an npm registry duplicate-version check, and `npm publish --access public`.

The publish workflow commits no `.npmrc` and uses no long-lived npm token. npm trusted publishing must be configured on npm before the first release-triggered publish.

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

## Version bump and local verification

1. Choose a new package version that has never been published to npm.
2. Update both `package.json` and `package-lock.json`:

   ```bash
   npm version <patch|minor|major|prerelease> --no-git-tag-version
   ```

3. Verify that npm does not already have the target version:

   ```bash
   PACKAGE_VERSION=$(node -p "require('./package.json').version")
   npm view "@rxreyn3/pi-azure-devops@$PACKAGE_VERSION" version --registry=https://registry.npmjs.org/
   ```

   If npm returns a version, choose a different version. npm package versions cannot be reused once published.

4. Verify the package locally:

   ```bash
   npm test
   npm run typecheck
   npm run build
   npm pack --dry-run
   ```

5. Inspect the package contents reported by `npm pack --dry-run`.

   Required included files include:

   - `dist/cli/index.js`
   - `dist/extension/index.js`
   - `dist/fixtures/build-get.json`
   - `skills/azure-devops/SKILL.md`
   - `prompts/ado-doctor.md`
   - `prompts/ado-status.md`
   - `prompts/ado-logs.md`
   - `prompts/ado-artifacts.md`
   - `prompts/ado-diagnose.md`
   - `README.md`
   - `LICENSE`
   - `CHANGELOG.md`

   Expected exclusions include `src/`, `test/`, `spikes/`, `.crush/`, `.vscode/`, local scratch files, committed `.npmrc`, and any secret-bearing config.

## Release publication

1. Commit and push the version bump and any release notes.
2. Create and push a tag that exactly matches the package version with a `v` prefix:

   ```bash
   PACKAGE_VERSION=$(node -p "require('./package.json').version")
   git tag "v$PACKAGE_VERSION"
   git push origin "v$PACKAGE_VERSION"
   ```

3. Create and publish a GitHub release for that exact tag.
4. In GitHub Actions, verify that `Publish npm package` starts from the release event.
5. If `npm-production` has required reviewers, approve the environment deployment only after confirming the release tag and package version.
6. Let the workflow complete. It must fail closed if the release tag is not `v<package.json version>` or if the package version is already published.

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