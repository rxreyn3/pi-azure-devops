# npm publication runbook

This runbook is manual-first. It prepares and validates `@rxreyn3/pi-azure-devops` for publication to the public npm registry and OMP/consumer installation before any Azure DevOps remote-mutation work begins.

## Safety boundaries

- Do not implement or expose Azure DevOps queue/cancel/rerun/preview mutation commands, tools, prompts, or transports as part of publication.
- Do not commit npm tokens, GitHub tokens, Azure DevOps PATs, `.env` files, or tokenized `.npmrc` entries.
- Do not add a committed registry override for `@rxreyn3`; consumers should be able to run plain `npm install @rxreyn3/pi-azure-devops` from the public npm registry.
- Keep token-bearing npm authentication in user-level config, a temporary shell environment, or another environment-specific secret store outside the repo.
- Do not paste tokens into logs, docs examples, package metadata, or issue text.
- Existing signed Azure DevOps artifact URL redaction and PAT-handling rules remain unchanged.

## Manual publication steps

1. Ensure the GitHub repository exists and is pushed: `rxreyn3/pi-azure-devops`.
2. Authenticate to npm outside the repository:

   ```bash
   npm login
   npm whoami --registry=https://registry.npmjs.org
   ```

3. Verify package name/version availability before publishing:

   ```bash
   npm view @rxreyn3/pi-azure-devops@0.1.1 version --registry=https://registry.npmjs.org
   ```

   If npm returns a version, bump to the next patch or prerelease before publishing. npm package versions cannot be reused once published.

4. Verify the package locally:

   ```bash
   npm test
   npm run typecheck
   npm run build
   ```

5. Inspect the package contents without creating a tarball:

   ```bash
   npm pack --dry-run
   ```

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

6. Create the tarball and install it into a temporary project outside this repo:

   ```bash
   npm pack
   mkdir -p /tmp/pi-azure-devops-install-smoke
   cd /tmp/pi-azure-devops-install-smoke
   npm init -y
   npm install /path/to/rxreyn3-pi-azure-devops-0.1.1.tgz
   ./node_modules/.bin/pi-ado doctor --mock --json
   ```

7. Inspect installed package metadata in the temporary project and confirm:

   - `pi.extensions` points at `./dist/extension/index.js`.
   - `pi.skills` points at `./skills`.
   - `pi.prompts` points at the installed prompt markdown files.

8. Publish manually only after the tarball install smoke test passes:

   ```bash
   npm publish
   ```

   `publishConfig.access` is set to `public` so the scoped package publishes as public on npm without requiring `--access public`.

9. In OMP or another consumer project, install and smoke-test from the public npm registry:

   ```bash
   npm install @rxreyn3/pi-azure-devops
   ./node_modules/.bin/pi-ado doctor --mock --json
   ```

10. Run manual live tests only with existing read-only or local-write-gated operations:

    - Read-only diagnostics/status/log/artifact metadata commands.
    - Artifact download preview without `--confirm` first.
    - Local artifact download/extract only after reviewing preview and supplying the explicit confirmation flag.

Do not proceed to Phase 8 remote mutation work until package tarball installation and OMP/consumer discovery have been validated from the public npm package.
