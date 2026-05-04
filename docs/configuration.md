# Configuration (Phase 1 foundation)

## Resolution order

`src/core/config.ts` resolves organization/project/profile in this order:

1. explicit CLI inputs (`--organization`, `--project`, `--profile`)
2. environment variables
3. nearest project config (walk up from `cwd`):
   - `.pi/azure-devops.json`
   - `.pi/azure-devops/config.json`
4. user config:
   - `~/.pi/agent/azure-devops/config.json`

## Environment variables

Organization candidates (first found wins):

- `PI_AZURE_DEVOPS_ORGANIZATION`
- `PI_ADO_ORGANIZATION`
- `ADO_ORGANIZATION`

Project candidates:

- `PI_AZURE_DEVOPS_PROJECT`
- `PI_ADO_PROJECT`
- `ADO_PROJECT`

Profile candidates:

- `PI_AZURE_DEVOPS_PROFILE`
- `PI_ADO_PROFILE`
- `ADO_PROFILE`

Token candidates (auth module):

- `PI_AZURE_DEVOPS_PAT`
- `PI_ADO_PAT`
- `AZURE_DEVOPS_PAT`
- `AZURE_DEVOPS_EXT_PAT`
- `ADO_PAT`
- `SYSTEM_ACCESSTOKEN`

## Config file shape (simple/typed)

```json
{
  "defaultProfile": "example",
  "profiles": {
    "example": {
      "organization": "<your-org-or-url>",
      "project": "<your-project>"
    }
  }
}
```

Keep PAT/token values out of config files. The resolver warns if config text looks token-like.

## Mock/no-network mode

CLI and spike both support mock mode with fixtures. Use any positive integer for `<mock-build-id>`; it is fixture input, not a real Azure DevOps build ID.

```bash
pi-ado doctor --mock --json
pi-ado status --mock --build-id <mock-build-id> --json
npm run --silent spike:rest -- --mock --json
```

## Env-driven live validation examples (placeholder values)

```bash
export ADO_ORGANIZATION="<your-org-or-url>"
export ADO_PROJECT="<your-project>"
export ADO_PAT="<your-pat>"
```

Then run read-only calls:

```bash
pi-ado doctor --json
pi-ado status --build-id <build-id> --json
pi-ado logs --build-id <build-id> --job-id <job-guid> --task-id <task-guid> --json
pi-ado artifacts --build-id <build-id> --json
```

## Genericness rule

Do not hardcode org/project/build/job/task values in package source or defaults. Use placeholders/env vars only.
