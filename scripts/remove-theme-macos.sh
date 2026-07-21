#!/bin/bash

# Remove a saved theme pack from themes/<id>/. Never deletes the live THEME_DIR.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_ID=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: remove-theme-macos.sh --id <theme-id>"
case "$THEME_ID" in
  *[!A-Za-z0-9_-]*|'') fail "Theme id may contain only letters, numbers, underscores, and hyphens." ;;
esac
[ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."
case "$THEME_ID" in
  preset-*) fail "Built-in preset themes cannot be deleted: $THEME_ID" ;;
esac

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
themes_root_real="$(cd "$THEMES_ROOT" && pwd -P)"
src_real="$(cd "$SRC" && pwd -P)"
case "$src_real/" in "$themes_root_real/"*) ;; *) fail "Theme directory escapes the saved theme library." ;; esac

# Refuse to delete the pack that currently matches the live theme.json hash.
if [ -f "$THEME_DIR/theme.json" ]; then
  live_hash="$(/usr/bin/shasum -a 256 "$THEME_DIR/theme.json" 2>/dev/null | /usr/bin/awk '{print $1}')"
  pack_hash="$(/usr/bin/shasum -a 256 "$SRC/theme.json" 2>/dev/null | /usr/bin/awk '{print $1}')"
  if [ -n "$live_hash" ] && [ "$live_hash" = "$pack_hash" ]; then
    fail "Cannot delete the theme that is currently active. Switch to another skin first."
  fi
fi

/bin/rm -rf "$SRC"
printf 'Removed theme: %s\n' "$THEME_ID"
