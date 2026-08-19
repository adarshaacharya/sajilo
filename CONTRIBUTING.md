# Contributing to Sajilo

## Development baseline

- Rust (pinned version in `rust-toolchain.toml`)
- Bun
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
- No third-party runtime dependencies without a written reason

## Before opening a pull request

1. Keep the change scoped to one feature or concern.
2. Follow the conventions in [CLAUDE.md](CLAUDE.md).
3. Add or update tests for pure business logic and service behavior —
   `sajilo-core` and `sajilo-providers` tests never touch the network; provider
   tests read from `fixtures/`.
4. Run `cargo test --workspace` and, for frontend changes, `bun run typecheck`
   and `bun run lint` from `apps/desktop`.
5. Verify the menu-bar interaction manually when changing the desktop UI.
6. Explain user-visible changes and data-source changes in the pull request.

## Commit guidance

Use short imperative commits:

```text
Add BS date formatting
Cache NRB forex response
Fix calendar month boundary
```

Avoid mixing formatting-only cleanup with behavior changes.

## Data-source changes

Any new remote provider must document its source, permitted use, refresh
interval, cache policy, stale-data behavior, and failure state. Fetching and
parsing live in `crates/sajilo-providers` — never in a frontend component.
