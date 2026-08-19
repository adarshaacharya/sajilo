# Releasing Sajilo

`.github/workflows/release-desktop.yml` builds macOS (arm64 + x64), Windows, and
Linux on every `v*` tag and publishes a GitHub prerelease with the installers
attached.

## Before releasing

1. Bump `version` in `apps/desktop/src-tauri/tauri.conf.json`.
2. Commit and push.

## Publish a beta

```bash
git tag -a v0.1.0-beta.1 -m "Sajilo 0.1.0 beta 1"
git push origin v0.1.0-beta.1
```

For a stable release, use the matching tag without `-beta.N`, e.g. `v0.1.0`.

## The updater

Tauri's own updater plugin (`tauri-plugin-updater`) checks a `latest.json` that
`tauri-action` generates and attaches to the GitHub release automatically — no
separate feed file to maintain, unlike the old Sparkle `appcast.xml`.

It only signs artifacts, and the update-checker only activates in the built
app, once the signing keypair exists:

1. Run `scripts/generate-updater-key.sh` once. It refuses to overwrite an
   existing key. **The private key never leaves your machine** — it is what
   proves an update came from you.
2. Add three repository secrets: `TAURI_SIGNING_PRIVATE_KEY`,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (both from the generated keypair), and
   `SAJILO_UPDATER_PUBKEY` (the public key's contents, baked into the binary at
   compile time — see `register_updater` in `apps/desktop/src-tauri/src/lib.rs`).

Until those secrets exist, `release-desktop.yml` still builds and publishes,
just with unsigned artifacts and the updater compiled out of the binary
entirely (`updater_enabled()` returns `false`, and the Settings "check for
updates" row stays hidden) — this is deliberate rather than a broken state.

## Do not commit build artifacts

`target/`, `dist/`, `node_modules/`, and platform bundle output are generated
and already covered by `.gitignore`.
