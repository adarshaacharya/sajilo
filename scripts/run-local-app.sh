#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/.build"
APP_PATH="$BUILD_ROOT/Sajilo.app"
EXECUTABLE_PATH="$BUILD_ROOT/arm64-apple-macosx/debug/Sajilo"
LOCAL_EXECUTABLE_PATH="$BUILD_ROOT/Sajilo-local"
RESOURCE_BUNDLE="Sajilo_SajiloApp.bundle"
RESOURCE_BUNDLE_PATH="$BUILD_ROOT/arm64-apple-macosx/debug/$RESOURCE_BUNDLE"
SPARKLE_FRAMEWORK_PATH="$BUILD_ROOT/arm64-apple-macosx/debug/Sparkle.framework"

cd "$PROJECT_ROOT"
swift build --product Sajilo

# Recreate the hand-built bundle so stale frameworks or signatures from an
# earlier local run can never leak into the next launch.
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Frameworks"
mkdir -p "$APP_PATH/Contents/Resources"
cp "$PROJECT_ROOT/scripts/AppBundleInfo.plist" "$APP_PATH/Contents/Info.plist"

# The icon. Without it macOS falls back to its generic blank app placeholder,
# which is what ships if this line is ever dropped. Regenerate with
# `swift scripts/make-app-icon.swift` after changing the palette.
cp "$PROJECT_ROOT/scripts/AppIcon.icns" "$APP_PATH/Contents/Resources/AppIcon.icns"

# SwiftPM's executable is not linked as part of an Xcode app target, so add the
# conventional app-bundle framework search path that Xcode would normally set.
# Patch it before placing it inside the bundle. The completed app is signed
# only after all code and resources have reached their final locations.
cp "$EXECUTABLE_PATH" "$LOCAL_EXECUTABLE_PATH"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$LOCAL_EXECUTABLE_PATH"
cp "$LOCAL_EXECUTABLE_PATH" "$APP_PATH/Contents/MacOS/Sajilo"

# Resources belong under `Contents/Resources` in a sealed macOS bundle. Sajilo's
# resource accessor knows this production location and falls back to SwiftPM's
# generated lookup only for tests and a bare `swift run`.
rm -rf "$APP_PATH/Contents/Resources/$RESOURCE_BUNDLE"
cp -R "$RESOURCE_BUNDLE_PATH" "$APP_PATH/Contents/Resources/$RESOURCE_BUNDLE"

# Sparkle is a dynamic framework. SwiftPM links it into the executable but does
# not assemble a distributable app bundle, so the local launcher must embed it
# explicitly at the rpath expected by the executable.
rm -rf "$APP_PATH/Contents/Frameworks/Sparkle.framework"
cp -R "$SPARKLE_FRAMEWORK_PATH" "$APP_PATH/Contents/Frameworks/Sparkle.framework"

# Sign after the bundle is complete so the resource seal includes both the
# generated data bundle and Sparkle. The future release pipeline will re-sign
# Sparkle's nested helpers inside-out with Developer ID, then sign this outer
# app and submit the completed archive for notarization.
codesign --force --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

# A previous background-only build will not refresh its activation policy on its
# own. Restart only this app's local build before opening the visual debug app.
pkill -f "$APP_PATH/Contents/MacOS/Sajilo" 2>/dev/null || true
open -n "$APP_PATH"
