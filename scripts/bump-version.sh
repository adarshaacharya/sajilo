#!/usr/bin/env bash
# Bumps the desktop app's version in every place it needs to match, then
# creates and pushes the matching git tag.
#
# The tag and the version field drifting apart is exactly what happened
# across the v0.1.1-beta.N releases: the tag kept climbing while
# tauri.conf.json stayed at 0.1.1, so the in-app updater saw an unchanged
# version and reported every one of those builds as "up to date". This
# script makes the tag a function of the version, not a separate thing
# someone has to remember to keep in sync.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version>   e.g. $0 0.1.3" >&2
  exit 1
fi

VERSION="$1"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Not a semver version: $VERSION" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/apps/desktop/package.json"
CONF="$ROOT/apps/desktop/src-tauri/tauri.conf.json"

for f in "$PKG" "$CONF"; do
  CURRENT=$(python3 -c "import json; print(json.load(open('$f'))['version'])")
  if [ "$CURRENT" = "$VERSION" ]; then
    echo "$f is already at $VERSION" >&2
    exit 1
  fi
  python3 - "$f" "$VERSION" <<'PY'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path) as fh:
    data = json.load(fh)
data["version"] = version
with open(path, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
PY
done

cd "$ROOT"
git add "$PKG" "$CONF"
git commit -m "chore: bump desktop app to $VERSION"
git push origin "$(git rev-parse --abbrev-ref HEAD)"

TAG="v$VERSION"
git tag "$TAG"
git push origin "$TAG"

echo
echo "Pushed $TAG. release-desktop.yml is now building it."
echo "Once it's green, publish the release as 'Latest' on GitHub."
