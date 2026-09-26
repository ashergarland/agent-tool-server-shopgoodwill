# Security

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not
open a public issue for an undisclosed vulnerability.

The default mode is disabled and the fixture profile is local, read-only, synthetic, and
network-free. Authorized provider mode requires an independently approved endpoint and may use an
optional operator-managed bearer token. Never include provider credentials, cookies, buyer data,
live endpoints, or operator state in issues, logs, fixtures, commits, or error reports.

The capability returns only allowlisted public listing fields, sanitizes seller HTML, masks public
bidder labels, rejects redirects, and bounds response sizes. Keep secret values in an external
secret store, keep operator desired state in private Git, use least privilege, and preserve the
shared security workflow gates.
