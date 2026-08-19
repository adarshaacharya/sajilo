#!/usr/bin/env bash
# Generates the Tauri updater signing keypair.
#
# Run this ONCE, then put into the repository's CI secrets:
#   * the PRIVATE key and its password, as TAURI_SIGNING_PRIVATE_KEY and
#     TAURI_SIGNING_PRIVATE_KEY_PASSWORD (these sign every release artifact)
#   * the PUBLIC key (sajilo.key.pub's contents), as SAJILO_UPDATER_PUBKEY —
#     this is baked into the binary at compile time (see lib.rs's
#     register_updater), never written into tauri.conf.json
#
# The private key is what proves an update came from you. If it leaks, anyone can
# ship a signed update to every install; if it is lost, no existing install can
# ever be updated again. It is deliberately written outside the repository so it
# cannot be committed by accident.
set -euo pipefail

OUT="${1:-$HOME/.sajilo/updater}"
mkdir -p "$OUT"

if [ -f "$OUT/sajilo.key" ]; then
  echo "A key already exists at $OUT/sajilo.key — refusing to overwrite it." >&2
  echo "Losing it means no existing install can be updated again." >&2
  exit 1
fi

cd "$(dirname "$0")/../apps/desktop"
bun run tauri signer generate -w "$OUT/sajilo.key"

chmod 600 "$OUT/sajilo.key"
echo
echo "Private key: $OUT/sajilo.key   (keep it; never commit it)"
echo "Public key:  $OUT/sajilo.key.pub"
echo
echo "Next: put $OUT/sajilo.key.pub's contents into the SAJILO_UPDATER_PUBKEY repo secret"
