#!/bin/bash

# Rename a saved theme pack in themes/<id>/theme.json (and the live copy if active).

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_ID=""
THEME_NAME=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: rename-theme-macos.sh --id <theme-id> --name <name>"
case "$THEME_ID" in
  *[!A-Za-z0-9_-]*|'') fail "Theme id may contain only letters, numbers, underscores, and hyphens." ;;
esac
[ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."
THEME_NAME="$(printf '%s' "$THEME_NAME" | /usr/bin/tr -d '\r\n')"
THEME_NAME="${THEME_NAME#"${THEME_NAME%%[![:space:]]*}"}"
THEME_NAME="${THEME_NAME%"${THEME_NAME##*[![:space:]]}"}"
[ -n "$THEME_NAME" ] || fail "Theme name cannot be empty."
[ "${#THEME_NAME}" -le 80 ] || fail "Theme name is too long."

ensure_state_root
ensure_node_runtime
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
themes_root_real="$(cd "$THEMES_ROOT" && pwd -P)"
src_real="$(cd "$SRC" && pwd -P)"
case "$src_real/" in "$themes_root_real/"*) ;; *) fail "Theme directory escapes the saved theme library." ;; esac

update_name() {
  local file="$1"
  export THEME_NAME
  "$NODE" -e '
const fs = require("fs");
const file = process.argv[1];
const name = process.env.THEME_NAME;
const theme = JSON.parse(fs.readFileSync(file, "utf8"));
theme.name = name;
const temporary = `${file}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(theme, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporary, file);
' "$file"
}

# Detect active pack by content hash *before* rewriting the name.
SYNC_LIVE="false"
if [ -f "$THEME_DIR/theme.json" ]; then
  live_hash="$(/usr/bin/shasum -a 256 "$THEME_DIR/theme.json" 2>/dev/null | /usr/bin/awk '{print $1}')"
  pack_hash="$(/usr/bin/shasum -a 256 "$SRC/theme.json" 2>/dev/null | /usr/bin/awk '{print $1}')"
  if [ -n "$live_hash" ] && [ -n "$pack_hash" ] && [ "$live_hash" = "$pack_hash" ]; then
    SYNC_LIVE="true"
  fi
fi

update_name "$SRC/theme.json"
if [ "$SYNC_LIVE" = "true" ]; then
  update_name "$THEME_DIR/theme.json"
fi

printf 'Renamed theme %s → %s\n' "$THEME_ID" "$THEME_NAME"
