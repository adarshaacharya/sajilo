#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/.build"
APP_PATH="$BUILD_ROOT/Sajilo.app"
EXECUTABLE_PATH="$BUILD_ROOT/arm64-apple-macosx/debug/Sajilo"

cd "$PROJECT_ROOT"
swift build --product Sajilo

mkdir -p "$APP_PATH/Contents/MacOS"
cp "$PROJECT_ROOT/scripts/AppBundleInfo.plist" "$APP_PATH/Contents/Info.plist"
cp "$EXECUTABLE_PATH" "$APP_PATH/Contents/MacOS/Sajilo"

# A previous background-only build will not refresh its activation policy on its
# own. Restart only this app's local build before opening the visual debug app.
pkill -f "$APP_PATH/Contents/MacOS/Sajilo" 2>/dev/null || true
open -n "$APP_PATH"
