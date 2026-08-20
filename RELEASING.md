# Releasing Sajilo

`.github/workflows/release-desktop.yml` builds macOS (arm64 + x64), Windows, and
Linux on every `v*` tag and publishes a GitHub release with the installers
attached.

## Verifying a build without releasing

`.github/workflows/verify-build.yml` runs the same four-platform build with no
tagging, no publishing, and no signing secrets touched — trigger it manually
(Actions tab → Verify desktop build → Run workflow, or `gh workflow run
verify-build.yml`) to catch a build break before spending a real version
number and release on finding out.

## Cutting a release

```bash
./scripts/bump-version.sh 0.1.3
```

Bumps `version` in `apps/desktop/package.json` and
`apps/desktop/src-tauri/tauri.conf.json` together, commits, pushes, then
creates and pushes the matching `v0.1.3` tag — which is what
`release-desktop.yml` builds from.

**The version field must change on every release, no exceptions.** The
updater decides whether a build is newer purely by comparing this number
against what's installed; the git tag name is not part of that comparison.
Retagging without bumping the version (`v0.1.1-beta.2`, `v0.1.1-beta.3`, …
all reporting `0.1.1`) is exactly how several releases in a row silently
failed to show up as updates — every install already at `0.1.1` read the
newest one as "up to date" regardless of what the tag said. Always use the
script rather than tagging by hand, so the tag can never drift from the
version it's supposed to match.

Every GitHub release should be published as **"Latest"**, not "Pre-release"
— GitHub excludes anything flagged pre-release from `/releases/latest/`,
which is the URL the updater polls, so a pre-release build is invisible to
it no matter how new it is.

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
