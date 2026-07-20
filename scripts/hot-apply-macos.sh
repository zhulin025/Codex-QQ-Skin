#!/bin/bash
# Hot-apply the repo skin into the installed engine and force a live reinject.
# Use this when Codex is already running with QQ Skin and CSS/JS edits look "stuck".

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port 2>/dev/null || true)"
  case "${saved_port:-}" in ''|*[!0-9]*) ;; *) PORT="$saved_port" ;; esac
fi

printf 'Codex QQ Skin: hot-applying %s → %s\n' "$PROJECT_ROOT" "$INSTALL_ROOT"

if [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  /bin/mkdir -p "$INSTALL_ROOT"
  /usr/bin/rsync -a \
    --exclude '.git/' \
    --exclude '.DS_Store' \
    --exclude 'release/' \
    --exclude 'runtime/' \
    "$PROJECT_ROOT/" "$INSTALL_ROOT/"
fi

# Always re-enter from the installed copy so PATH/state match the Desktop launcher.
if [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  exec "$INSTALL_ROOT/scripts/hot-apply-macos.sh" --port "$PORT"
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    *) fail "Unknown hot-apply argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
ensure_state_root

printf 'Stopping leftover injectors…\n'
stop_known_skin_injectors || true
/bin/rm -f "$STATE_PATH"

if ! verified_cdp_endpoint "$PORT"; then
  fail "Codex CDP is not open on port $PORT. Start with Desktop「Codex QQ Skin.command」first, then rerun hot-apply."
fi

printf 'Force-injecting skin payload…\n'
"$NODE" "$INJECTOR" --once --enable-skin --reload --port "$PORT" --theme-dir "$THEME_DIR" >/dev/null

INJECTOR_PID="$(launch_injector_daemon "$PORT")"
/bin/sleep 0.15
/bin/kill -0 "$INJECTOR_PID" 2>/dev/null || fail "The injector exited during hot-apply. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"

printf 'Hot-apply complete (version %s, injector pid %s). Switch tabs once if the UI looks stale.\n' \
  "$SKIN_VERSION" "$INJECTOR_PID"
