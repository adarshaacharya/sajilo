#!/bin/zsh
set -euo pipefail

# Builds a direct-download archive without needing an Apple Developer account.
# The resulting app is ad-hoc signed, which preserves its internal integrity
# but does not make it an "identified developer" app to Gatekeeper. Sparkle
# update archives are signed separately on the maintainer's Mac, using the
# private EdDSA key kept in their Keychain.

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/.build"
PACKAGE_ROOT="$BUILD_ROOT/release-package"
APP_PATH="$PACKAGE_ROOT/Sajilo.app"
ARCHIVE_PATH="$PACKAGE_ROOT/Sajilo-macos-arm64.zip"
DMG_PATH="$PACKAGE_ROOT/Sajilo-macos-arm64.dmg"
DMG_CONTENTS_PATH="$PACKAGE_ROOT/dmg-contents"
RESOURCE_BUNDLE="Sajilo_SajiloApp.bundle"

cd "$PROJECT_ROOT"

swift build -c release --product Sajilo
BIN_PATH="$(swift build -c release --show-bin-path)"

EXECUTABLE_PATH="$BIN_PATH/Sajilo"
RESOURCE_BUNDLE_PATH="$BIN_PATH/$RESOURCE_BUNDLE"
SPARKLE_FRAMEWORK_PATH="$BIN_PATH/Sparkle.framework"

rm -rf "$PACKAGE_ROOT"
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Frameworks"
mkdir -p "$APP_PATH/Contents/Resources"
cp "$PROJECT_ROOT/scripts/AppBundleInfo.plist" "$APP_PATH/Contents/Info.plist"

# The icon. Without it macOS falls back to its generic blank app placeholder,
# which is what ships if this line is ever dropped. Regenerate with
# `swift scripts/make-app-icon.swift` after changing the palette.
cp "$PROJECT_ROOT/scripts/AppIcon.icns" "$APP_PATH/Contents/Resources/AppIcon.icns"

# SwiftPM builds an executable, not an application bundle. Assemble the bundle
# exactly as the local launcher does, then ad-hoc sign it for direct download.
cp "$EXECUTABLE_PATH" "$APP_PATH/Contents/MacOS/Sajilo"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP_PATH/Contents/MacOS/Sajilo"
cp -R "$RESOURCE_BUNDLE_PATH" "$APP_PATH/Contents/Resources/$RESOURCE_BUNDLE"
cp -R "$SPARKLE_FRAMEWORK_PATH" "$APP_PATH/Contents/Frameworks/Sparkle.framework"

codesign --force --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

# `ditto` preserves framework symlinks and macOS metadata; `zip -r` does not.
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ARCHIVE_PATH"

# A DMG lets people drag Sajilo into Applications without handling a ZIP.
mkdir -p "$DMG_CONTENTS_PATH"
ditto "$APP_PATH" "$DMG_CONTENTS_PATH/Sajilo.app"
ln -s /Applications "$DMG_CONTENTS_PATH/Applications"
hdiutil create \
  -volname "Sajilo" \
  -srcfolder "$DMG_CONTENTS_PATH" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "Created $ARCHIVE_PATH"
echo "Created $DMG_PATH"
