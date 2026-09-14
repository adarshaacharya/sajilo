# Security and privacy

Sajilo is designed to be local-first and account-free.

## Anonymous daily count

Sajilo sends at most one anonymous count per Nepal day. It is on by default,
and switching it off in Settings › System › Privacy stops it entirely.
Each count contains the app version, previous version after an update,
operating system, CPU architecture, the Nepal-time day, and days since the
prior count (capped at 45); Cloudflare derives an approximate country from the
connection. The service stores only aggregate totals. It does not store an
account, device or installation identifier, IP address, exact request time, or
in-app activity.

- Do not commit API keys, certificates, provisioning profiles, or local `.env` files.
- Do not log clipboard content, precise location, or personally identifying data.
- Use HTTPS for every remote data source.
- Request location or notification permission only after a user enables the related feature.
- Report security concerns privately to the repository owner rather than opening a public issue.
