# Deployment profiles

The canonical public declaration is [`../capability-profiles.json`](../capability-profiles.json).
It uses Agent Tool Platform deployment contract v1 at revision
`98ec8162fb11d5c04aee9e6f7b3625a472a0180d`.

## Local fixture

`local-fixture` runs the packaged stdio executable with deterministic synthetic data:

| Dimension | Value           | Consequence                            |
| --------- | --------------- | -------------------------------------- |
| execution | `local`         | The invoking machine runs the process. |
| delivery  | `package`       | npm supplies the built artifact.       |
| access    | `local-process` | The caller owns the stdio pipe.        |
| workload  | `none`          | No external data or provider access.   |
| provider  | `none`          | Fixture mode makes no network request. |
| mutation  | `read-only`     | Every tool changes no state.           |

This is the profile for CI, conformance, MCP wiring, and host/ChatGPT integration testing.

## Local authorized

`local-authorized-token` uses the same package and stdio boundary for an approved endpoint that
requires a bearer token, and adds an external provider workload:

| Dimension | Value           | Consequence                                                     |
| --------- | --------------- | --------------------------------------------------------------- |
| execution | `local`         | The invoking machine runs the process.                          |
| delivery  | `package`       | npm supplies the built artifact.                                |
| access    | `local-process` | The caller owns the stdio pipe.                                 |
| workload  | `provider`      | Calls one approved compatible read-only endpoint per operation. |
| provider  | `external`      | Operator authorization and configuration are prerequisites.     |
| mutation  | `read-only`     | The provider contract contains no mutation operation.           |

The approval variable is a safety gate, not proof of legal authorization. Platform deployment
contract v1 requires an external-provider profile to name a secret and scoped identity, so this
profile declares `SHOPGOODWILL_API_TOKEN` for token-requiring endpoints. The runtime keeps the token
optional when an independently approved endpoint does not require one. No live endpoint,
credential value, account identifier, or operator instance belongs in this public repository.

## Disabled default

Outside tests, omitted provider configuration selects `disabled`. The process remains healthy but
provider readiness is `not_ready`, and tool calls return a normalized provider-disabled error
without making a network request.

Provider readiness is distinct from process liveness. The public profiles describe supported
shapes; immutable deployment pins, secret references, rollback intent, and operator desired state
belong in private operator Git, while secret values and observed deployment evidence remain in
their provider systems.
