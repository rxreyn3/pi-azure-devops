# Authentication (Initial)

## Supported token lookup order

1. `PI_AZURE_DEVOPS_PAT`
2. `PI_ADO_PAT`
3. `AZURE_DEVOPS_PAT`
4. `AZURE_DEVOPS_EXT_PAT`
5. `ADO_PAT`
6. `SYSTEM_ACCESSTOKEN`

The first non-empty value is used.

## Transport

- PAT/token is sent via Basic auth using `":" + token`.
- Token values and Authorization headers must never be logged.

## Notes

- No credential prompting is implemented in this pass.
- No Azure CLI auth dependency is required.
- Token scope adequacy is verified operationally during live API calls, not by direct scope introspection.
