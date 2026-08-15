#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/.build"
APP_PATH="$BUILD_ROOT/Sajilo.app"
EXECUTABLE_PATH="$BUILD_ROOT/arm64-apple-macosx/debug/Sajilo"
RESOURCE_BUNDLE="Sajilo_SajiloApp.bundle"
RESOURCE_BUNDLE_PATH="$BUILD_ROOT/arm64-apple-macosx/debug/$RESOURCE_BUNDLE"

cd "$PROJECT_ROOT"
swift build --product Sajilo

mkdir -p "$APP_PATH/Contents/MacOS"
cp "$PROJECT_ROOT/scripts/AppBundleInfo.plist" "$APP_PATH/Contents/Info.plist"
cp "$EXECUTABLE_PATH" "$APP_PATH/Contents/MacOS/Sajilo"

# SwiftPM's generated `Bundle.module` accessor looks beside the main bundle
# first and only then at an absolute path inside .build. Without this copy the
# app appears to work on the machine that built it and calls `fatalError` on
# every other one, the moment any calendar event data is read.
rm -rf "$APP_PATH/$RESOURCE_BUNDLE"
cp -R "$RESOURCE_BUNDLE_PATH" "$APP_PATH/$RESOURCE_BUNDLE"

# A previous background-only build will not refresh its activation policy on its
# own. Restart only this app's local build before opening the visual debug app.
pkill -f "$APP_PATH/Contents/MacOS/Sajilo" 2>/dev/null || true
open -n "$APP_PATH"
