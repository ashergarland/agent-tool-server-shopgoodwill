# ShopGoodwill capability v1 review findings

## Review target

- Repository: `ashergarland/agent-tool-server-shopgoodwill`
- Baseline: `bff1f458e24d967c9d36cecfeccefd31d93c9104`
- Template authority: `ashergarland/agent-tool-server-template` at `4b5a5d93c99614a6ca64d65e10f56918c45f1472`
- Reviewed candidate: `1e5b83794a8aec2d7d2574c348cd1ad0e06463e7`
- Branch at review time: `agents/shopgoodwill-capability-v1`

The candidate descended directly from the baseline. All 43 baseline tracked blobs matched the
template authority at the common paths. The review was read-only; this summary is a separate
post-review artifact and no capability code was changed.

## Findings

| # | Severity | File | Lines | Finding | Confidence |
|---|----------|------|-------|---------|------------|
| 1 | 🟠 HIGH | `src/config.ts`; `src/providers/http.ts` | `13`; `243`; `265`; `408` | An absolute `SHOPGOODWILL_SELLER_DIRECTORY_PATH` such as `https://unapproved.example/path` passes validation. `new URL(path, approvedBase)` then selects that authority, and the provider attaches the configured bearer token to the request. Redirect rejection does not prevent this initial-origin change. | 9/10 |
| 2 | ⚪ LOW | `src/tools/definitions.ts`; `src/providers/normalize.ts` | `11`; `200` | Output URL schemas do not declare a maximum length. Current normalization rejects raw URL strings over 2,048 characters, but the emitted tool/OpenAPI contract does not express that bound. | 8/10 |
| 3 | ⚪ LOW | `src/providers/http.ts` | `313` | HTTP 401 and 403 responses share the generic `upstream_4xx` mapping; focused authorization/forbidden mappings and tests would make these provider failures clearer. | 8/10 |
| 4 | ⚪ LOW | `capability-profiles.json`; `README.md` | `62`; `84` | The pinned Platform deployment validator requires at least one secret name for every external-provider profile, so the current deployment declaration can describe the token-required profile but not a tokenless authorized deployment. The README accurately documents this limitation. This is a Platform contract follow-up, not a capability-local workaround. | 9/10 |

### Required repair for finding 1

Require the seller-directory override to be a strictly relative path and verify that the resolved
request URL has the same origin as the configured approved base URL before adding authorization
headers. Add tests proving an absolute URL cannot be configured and that no bearer token can reach a
different origin.

## Review and validation notes

- The security review found no committed credentials, cookies, or private buyer/session data.
- Provider calls are disabled by default; fixture mode is deterministic and network-free.
- The candidate uses the pinned Agent Tool Platform revision
  `98ec8162fb11d5c04aee9e6f7b3625a472a0180d`; runtime and testkit remain `0.1.3`.
- The exact pinned Platform deployment validator passed, and deployment conformance passed all 3
  checks. Validation ran with Node `22.23.3`; no live provider traffic or deployment occurred.
- The candidate has five read-only tools and the package smoke test installed and invoked the
  package outside the repository.
- Review verdict: **CHANGES REQUIRED** until finding 1 is repaired.
