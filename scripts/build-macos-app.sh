#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$ROOT/package.json" | /usr/bin/head -n 1)"
OUTPUT_DIR="${1:-$ROOT/release}"
APP="$OUTPUT_DIR/Codex QQ Skin.app"
CONTENTS="$APP/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
PAYLOAD="$RESOURCES/CodexQQSkin"
BUILD_DIR="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/codex-qq-skin-build.XXXXXX")"
trap '/bin/rm -rf "$BUILD_DIR"' EXIT

/bin/rm -rf "$APP"
/bin/mkdir -p "$MACOS" "$PAYLOAD"

SDK="$(/usr/bin/xcrun --sdk macosx --show-sdk-path)"
for arch in arm64 x86_64; do
  /usr/bin/xcrun swiftc \
    -sdk "$SDK" \
    -target "${arch}-apple-macosx12.0" \
    -O \
    -framework AppKit \
    "$ROOT/macos-app/VersionPolicy.swift" \
    "$ROOT/macos-app/main.swift" \
    -o "$BUILD_DIR/CodexQQSkin-$arch"
done
/usr/bin/lipo -create "$BUILD_DIR/CodexQQSkin-arm64" "$BUILD_DIR/CodexQQSkin-x86_64" -output "$MACOS/CodexQQSkin"

/usr/bin/rsync -a \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'release/' \
  --exclude 'website/.vercel/' \
  --exclude 'macos-app/' \
  "$ROOT/" "$PAYLOAD/"
/bin/chmod 755 "$PAYLOAD"/*.command "$PAYLOAD"/scripts/*.sh 2>/dev/null || true

/bin/cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>Codex QQ Skin</string>
  <key>CFBundleExecutable</key><string>CodexQQSkin</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>xyz.liuwa.codex-qq-skin</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Codex QQ Skin</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>${VERSION//./}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

ICONSET="$BUILD_DIR/AppIcon.iconset"
/bin/mkdir -p "$ICONSET"
SOURCE_ICON="$ROOT/website/project-logo.png"
for spec in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" "64 icon_32x32@2x.png" "128 icon_128x128.png" "256 icon_128x128@2x.png" "256 icon_256x256.png" "512 icon_256x256@2x.png" "512 icon_512x512.png" "1024 icon_512x512@2x.png"; do
  set -- $spec
  /usr/bin/sips -z "$1" "$1" "$SOURCE_ICON" --out "$ICONSET/$2" >/dev/null
done
/usr/bin/iconutil -c icns "$ICONSET" -o "$RESOURCES/AppIcon.icns"

if [ -n "${DEVELOPER_ID_APPLICATION:-}" ]; then
  /usr/bin/codesign --force --deep --options runtime --timestamp --sign "$DEVELOPER_ID_APPLICATION" "$APP"
else
  /usr/bin/codesign --force --deep --sign - "$APP"
  printf 'Built with an ad-hoc signature. Set DEVELOPER_ID_APPLICATION for public distribution.\n' >&2
fi

printf '%s\n' "$APP"

ARCHIVE="$OUTPUT_DIR/Codex.QQ.Skin.app.zip"
/bin/rm -f "$ARCHIVE" "$ARCHIVE.sha256"
/usr/bin/ditto -c -k --keepParent "$APP" "$ARCHIVE"
HASH="$(/usr/bin/shasum -a 256 "$ARCHIVE" | /usr/bin/awk '{print $1}')"
printf '%s  %s\n' "$HASH" "$(/usr/bin/basename "$ARCHIVE")" > "$ARCHIVE.sha256"
printf '%s\n' "$ARCHIVE"
