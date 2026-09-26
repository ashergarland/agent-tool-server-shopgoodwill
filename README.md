# ShopGoodwill Research Capability

A thin, read-only ShopGoodwill research capability for the
[Agent Tool Platform](https://github.com/ashergarland/agent-tool-platform/tree/98ec8162fb11d5c04aee9e6f7b3625a472a0180d).
It normalizes bounded listing, item, shipping-estimate, category, and seller-directory data without
copying Platform-owned MCP, HTTP, OpenAPI, authentication, lifecycle, readiness, error, telemetry,
deployment, or testkit infrastructure.

This is not an official ShopGoodwill API client. ShopGoodwill does not publish a generally
available developer API, and its website uses an undocumented buyer API. Automated third-party
access may require prior written approval. The capability is therefore disabled by default and
supports live requests only through an endpoint that the operator is explicitly authorized to use.

The checked-in package version remains `0.0.0-development`. A stable `vX.Y.Z` tag is the
authoritative release version; the pinned shared release workflow stamps package and server
metadata on its runner.

## Tools

All tools are `kind: "read"`, advertise the MCP read-only annotation, and declare
`changesState: false`.

| Tool                             | Use                                                                                    | Boundaries                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `search_shopgoodwill`            | Discover active listings, seller inventory, or recent closed-auction evidence.         | One page, at most 40 US/USD records; requires a query, seller ID, or category ID; no crawling. |
| `get_shopgoodwill_item`          | Evaluate condition, completeness, policies, pickup, and combined-shipping eligibility. | One public item; at most 20 HTTPS image URLs and 50 masked public bids.                        |
| `estimate_shopgoodwill_shipping` | Estimate quantity-one shipping and handling to a US ZIP or ZIP+4.                      | Not checkout, tax, or a combined-shipping quote.                                               |
| `list_shopgoodwill_categories`   | Resolve category names and paths into category IDs.                                    | Flattened and filtered to at most 100 records.                                                 |
| `list_shopgoodwill_sellers`      | Resolve public seller identities and locations into numeric seller IDs.                | Filtered to at most 100 records; seller URLs are returned only when supplied reliably.         |

Returned seller text, titles, descriptions, and policies are untrusted data, never agent
instructions. Image URLs are references for a separate Vision capability; this capability does not
download or interpret images.

## Provider modes

### `disabled`

This is the default whenever `NODE_ENV` is not `test`.

- No network request is made.
- Tool calls return the Platform's normalized `not_ready` error with
  `reason: "provider_disabled"`.
- Readiness is `not_ready` and states that live access is disabled.

### `fixture`

Fixture mode is for CI, conformance, package validation, local MCP wiring, and host/ChatGPT
integration tests.

```powershell
$env:SHOPGOODWILL_PROVIDER_MODE = 'fixture'
npm run build
npm run mcp:stdio
```

- No network request is made.
- Responses and every nested record include `source: "fixture"` and `synthetic: true`.
- Titles and notices explicitly identify the records as synthetic.
- Fixed timestamps describe the fixture observation, not current inventory.
- Fixture records must never be represented as live or current ShopGoodwill inventory.
- `NODE_ENV=test` defaults to fixture mode, but integration hosts should set the mode explicitly.

### `authorized`

Authorized mode is only for an operator-configured endpoint that the operator is independently
authorized to use:

```powershell
$env:SHOPGOODWILL_PROVIDER_MODE = 'authorized'
$env:SHOPGOODWILL_API_BASE_URL = 'https://approved-proxy.example/shopgoodwill/api/'
$env:SHOPGOODWILL_ACCESS_APPROVED = 'true'
$env:SHOPGOODWILL_API_TOKEN = '<optional-provider-bearer-token>'
```

`SHOPGOODWILL_ACCESS_APPROVED=true` is an engineering safety gate. Setting it does **not** grant
permission, establish legal authorization, override ShopGoodwill terms, or prove that an endpoint
owner approved access. Authorization must exist independently.

The bearer token is optional and should be configured only when the approved endpoint requires
one. It is never included in tool output or transport-safe errors. The capability does not send
browser cookies, forward caller credentials, or require a signed-in ShopGoodwill session.

The public `local-authorized-token` deployment profile names `SHOPGOODWILL_API_TOKEN` because it
describes endpoints that require a bearer credential, and Platform deployment contract v1 requires
provider-backed profiles to declare a secret and scoped identity. The runtime itself deliberately
keeps the token optional so an independently approved endpoint that does not require a credential
is not forced to invent one.

## Authorized provider configuration

| Variable                               | Required                      | Default                    | Bounds / meaning                                                         |
| -------------------------------------- | ----------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `SHOPGOODWILL_PROVIDER_MODE`           | Yes for live access           | `disabled` outside tests   | `disabled`, `fixture`, or `authorized`                                   |
| `SHOPGOODWILL_API_BASE_URL`            | In `authorized` mode          | None                       | HTTPS URL; loopback HTTP is allowed only outside production              |
| `SHOPGOODWILL_ACCESS_APPROVED`         | In `authorized` mode          | `false`                    | Strict boolean engineering gate                                          |
| `SHOPGOODWILL_API_TOKEN`               | Only if the provider needs it | None                       | Optional bearer value, 1-4096 characters                                 |
| `SHOPGOODWILL_REQUEST_TIMEOUT_MS`      | No                            | `10000`                    | 100-60000 ms                                                             |
| `SHOPGOODWILL_MIN_REQUEST_INTERVAL_MS` | No                            | `1000`                     | 0-60000 ms; requests are serialized and start no faster than this        |
| `SHOPGOODWILL_MAX_RESPONSE_BYTES`      | No                            | `1000000`                  | 1024-5000000 bytes, checked from headers and while streaming             |
| `SHOPGOODWILL_SELLER_DIRECTORY_PATH`   | No                            | `Search/GetActiveLocation` | Relative path within the approved provider; cannot select another origin |

The base URL has no ShopGoodwill hostname default. It may identify an approved direct endpoint or
an authorized proxy. Credentials, query strings, and fragments are rejected in the base URL.
The seller-directory override cannot contain a scheme, authority, credentials, query, fragment,
backslash, or dot segment. Every authorized request is resolved against and confined to the single
configured provider origin; bearer credentials are attached only after that origin check and are
never forwarded across origins. Redirects remain rejected.

## Authorized provider contract

The HTTP adapter implements these buyer-compatible, read-only relative routes:

| Operation   | Method | Relative path                                         |
| ----------- | ------ | ----------------------------------------------------- |
| Search      | POST   | `Search/ItemListing`                                  |
| Item detail | GET    | `itemDetail/GetItemDetailModelByItemId/{positiveId}`  |
| Shipping    | POST   | `itemDetail/CalculateShipping`                        |
| Categories  | GET    | `Category/GetAllCategoryPageList`                     |
| Sellers     | GET    | `Search/GetActiveLocation` or the configured override |

Search uses the current mixed-type buyer-compatible body, including string prices, pagination,
boolean-like filters, seller/category ID strings, and verified sort fields. Shipping sends
`country: "US"`, `province: null`, `quantity: 1`, and an empty `clientIP`; it supports the
JSON-encoded HTML estimate returned by compatible providers. The seller route returns a bare array
whose useful public fields include `sellerId`, `searchFilterName`, `searchFilterNameLong`, and
`pickupCity`. Category normalization uses `mappedCatId` when the response's `categoryId` is zero.

An authorized proxy may add observation timestamps and normalized aliases, but it must preserve the
same public read-only semantics. Response data is defensively validated at runtime. Schema drift
fails explicitly rather than returning partial success.

### Verified sort mappings

The current first-party sort control and buyer requests established these mappings:

| Capability sort  | `sortColumn` | `sortDescending` |
| ---------------- | ------------ | ---------------- |
| `ending-soonest` | `"1"`        | `"false"`        |
| `newest`         | `"1"`        | `"true"`         |
| `price-lowest`   | `"4"`        | `"false"`        |
| `price-highest`  | `"4"`        | `"true"`         |
| `most-bids`      | `"3"`        | `"true"`         |

No reliable authorized mapping was established for `relevance`; the current first-party sort
control has no relevance option. Fixture mode supports deterministic relevance ordering, but an
authorized search requesting `relevance` returns an explicit
`unsupported_provider_feature` error. The tool default is `ending-soonest`, so omitted sorts remain
usable in authorized mode without inventing a mapping.

### Seller-directory evidence

On 2026-09-25 UTC, anonymous retrieval of the undocumented
`Search/GetActiveLocation` buyer-compatible route returned a bare 163-record seller array. The same
route and shape are independently corroborated by
[Bzcasper/sgw-jewelry-sniper at `94a74157`](https://github.com/Bzcasper/sgw-jewelry-sniper/blob/94a74157bbe34f2759988b251cb81e8967752c1c/ts/src/buyerapi.ts#L110-L113).
This is evidence of current wire behavior, not an official or stable API guarantee and not
authorization to call it.

Search and route behavior were also reviewed as protocol references in:

- [`scottmconway/shopgoodwill-scripts` at `cc8665f1`](https://github.com/scottmconway/shopgoodwill-scripts/tree/cc8665f1d8a62f76e175901cada3ac1972476598)
  (GPL-3.0);
- [`pipeworx-io/mcp-shopgoodwill` at `9872f7a1`](https://github.com/pipeworx-io/mcp-shopgoodwill/tree/9872f7a10e6fc8d5a84fb33ff3791651f0b5f242)
  (MIT);
- [`abarran02/ShopGoodwill` at `cbae9397`](https://github.com/abarran02/ShopGoodwill/tree/cbae9397ab7e38ff8b3dab752275dcbd61570d83)
  (MIT);
- [`robksawyer/shopgoodwill-API` at `faa30fa5`](https://github.com/robksawyer/shopgoodwill-API/tree/faa30fa5ec33d506bcb1ec53e1696b95c705b00e)
  (no declared license; historical behavior only).

No third-party client source code was copied into this MIT repository.

## Safety and privacy

The authorized adapter:

- propagates caller aborts and enforces a bounded request timeout;
- serializes upstream requests and enforces a configurable minimum start interval;
- confines every request and optional bearer credential to the configured approved provider origin;
- rejects redirects;
- requires JSON content types and handles JSON-encoded shipping HTML;
- enforces response limits from `Content-Length` and while streaming;
- bounds pages, records, hierarchy depth, descriptions, policies, images, and bid history;
- sanitizes active HTML, markup, controls, and prompt-like seller text into plain text;
- accepts only bounded HTTPS image URLs and never downloads images;
- normalizes 404, 429, timeout, invalid JSON, oversized response, redirect, schema drift, and
  upstream 5xx failures into transport-safe Platform errors;
- never returns raw HTML error pages, upstream payloads, credentials, or exception text.

Item normalization is an explicit public-field allowlist. It never returns account data, access
tokens, cookies, buyer identity, buyer email, buyer addresses, authenticated-user state, or other
session-specific fields even if an upstream payload contains them. Public bidder labels are masked.

Only US/USD records are supported. A zero-bid closed listing is represented as `sold: false` and is
not given a final sale price. A closed listing with bids is not claimed sold unless the provider
explicitly supplies that state.

## Example MCP configuration

After installing the package so the executable is on `PATH`, a local fixture-mode MCP host can use:

```json
{
  "mcpServers": {
    "shopgoodwill": {
      "command": "agent-tool-server-shopgoodwill",
      "args": [],
      "env": {
        "SHOPGOODWILL_PROVIDER_MODE": "fixture"
      }
    }
  }
}
```

For a source checkout, replace the command with `node` and set `args` to the absolute
`dist/stdio.js` path after `npm run build`. The stdio process binds no network listener. Fixture
mode is the recommended first step for MCP and ChatGPT host wiring.

## Example tool inputs

```json
{
  "query": "35mm camera",
  "categoryId": 11,
  "minPrice": 20,
  "maxPrice": 200,
  "sort": "ending-soonest",
  "page": 1,
  "limit": 20
}
```

```json
{
  "item": "https://shopgoodwill.com/item/990000001"
}
```

```json
{
  "item": 990000001,
  "zipCode": "97201-1234"
}
```

```json
{
  "query": "film cameras",
  "limit": 25
}
```

```json
{
  "query": "Portland",
  "limit": 25
}
```

Item references accept a positive safe integer or an exact HTTPS
`shopgoodwill.com/item/{positiveId}` URL. Other hosts, protocols, ports, credentials, query strings,
fragments, and malformed paths are rejected.

## Explicit exclusions

This repository does not implement:

- login, cookies, or account management;
- saved searches, favorites, or watchlists;
- bid placement, bid sniping, purchasing, or checkout;
- notifications or auction monitoring;
- broad historical scraping or automatic multi-page crawling;
- sales-tax calculation or combined-shipping promises;
- eBay comparisons, recommendations, deal scores, or maximum-bid reasoning;
- image interpretation;
- Shopping Agent instructions or behavior.

The future Shopping Agent may compose this capability with eBay and Vision capabilities. It owns
cross-market comparison, image-analysis workflows, product recommendations, and maximum-bid
reasoning. Those concerns intentionally remain outside this repository.

## Development and validation

Node.js 22 is required. The template pins:

- `@agent-tool-platform/runtime` `0.1.3`;
- `@agent-tool-platform/testkit` `0.1.3`;
- Agent Tool Platform revision `98ec8162fb11d5c04aee9e6f7b3625a472a0180d`.

Install and run all repository checks:

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run openapi:emit
npm run metadata:validate
npm run package:smoke
npm audit --omit=dev --audit-level=high
```

Deployment validation and conformance must use the exact pinned Platform revision:

```powershell
git clone https://github.com/ashergarland/agent-tool-platform.git ..\agent-tool-platform
git -C ..\agent-tool-platform checkout --detach 98ec8162fb11d5c04aee9e6f7b3625a472a0180d
npm --prefix ..\agent-tool-platform ci
npm --prefix ..\agent-tool-platform run build

$env:AGENT_TOOL_PLATFORM_CHECKOUT = (Resolve-Path ..\agent-tool-platform)
npm run deployment:validate
npm run deployment:conformance
```

`npm run package:smoke` builds and packs the real package, installs it into an external temporary
consumer, imports its public API, launches the installed stdio executable in fixture mode, lists all
five tools, and invokes `search_shopgoodwill`. It publishes nothing and removes temporary
artifacts.

## License

MIT. Protocol facts were independently researched with license-aware references; no third-party
client implementation source was copied.
