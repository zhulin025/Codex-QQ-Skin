#!/bin/bash

set -Eeuo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

record_start_error() {
  local code="$1"
  local line="$2"
  ensure_state_root
  printf '%s exit=%s line=%s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" "$line" >> "$START_ERROR_LOG"
  printf 'Codex QQ Skin: start failed at line %s (exit %s). See %s\n' "$line" "$code" "$START_ERROR_LOG" >&2
}
trap 'code=$?; record_start_error "$code" "$LINENO"' ERR

PORT=9341
PORT_EXPLICIT="false"
RESTART_EXISTING="false"
PROMPT_RESTART="false"
FOREGROUND_INJECTOR="false"
SKIN_MODE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --restart-existing) RESTART_EXISTING="true"; shift ;;
    --prompt-restart) PROMPT_RESTART="true"; shift ;;
    --foreground-injector) FOREGROUND_INJECTOR="true"; shift ;;
    --skin-mode) SKIN_MODE="${2:-}"; shift 2 ;;
    *) fail "Unknown start argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "调试端口无效：$PORT（需要 1024–65535 的数字）" ;; esac
[ -z "$SKIN_MODE" ] || [ "$SKIN_MODE" = "qq" ] || [ "$SKIN_MODE" = "custom" ] \
  || fail "Invalid skin mode: $SKIN_MODE"
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "调试端口必须在 1024–65535 之间，当前为：$PORT"

discover_codex_app
require_macos_runtime
ensure_state_root

if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port)" || fail "Could not read the existing state port."
  [ -n "$saved_port" ] && PORT="$saved_port"
fi

DEBUG_READY="false"
if verified_cdp_endpoint "$PORT"; then DEBUG_READY="true"; fi

if codex_is_running && [ "$DEBUG_READY" = "false" ]; then
  if [ "$PROMPT_RESTART" = "true" ] && [ "$RESTART_EXISTING" = "false" ]; then
    /usr/bin/osascript -e 'display dialog "Codex 需要重启一次才能启用 QQ Skin。" buttons {"取消", "重启并应用"} default button "重启并应用" with title "Codex QQ Skin"' >/dev/null \
      || fail "Theme launch was cancelled."
    RESTART_EXISTING="true"
  fi
  [ "$RESTART_EXISTING" = "true" ] || fail "Codex 正在运行，但未开启皮肤所需的调试端口。请先完全退出 Codex，或加上 --restart-existing 后重试。"
  stop_codex true
fi

# Clear any previous session before launching. A live PID whose recorded
# identity no longer matches (PID reuse after a crash, or a path rename such
# as dream-skin → qq-skin) must not block a fresh start: refuse to signal the
# foreign process, drop the stale state, and continue.
if [ -f "$STATE_PATH" ]; then
  if ! stop_recorded_injector; then
    printf 'Previous skin state could not stop its recorded injector safely; clearing stale state and continuing.\n' >&2
  fi
  /bin/rm -f "$STATE_PATH"
fi
stop_known_skin_injectors || true

INJECTOR_PID=""
if [ "$DEBUG_READY" = "false" ]; then
  PORT="$(select_available_port "$PORT")"
  printf 'Launching Codex with skin debug port %s…\n' "$PORT" >&2
  launch_codex_with_cdp "$PORT"
  # Start probing immediately instead of waiting for the native window to finish loading.
  if [ "$FOREGROUND_INJECTOR" != "true" ]; then
    INJECTOR_PID="$(launch_injector_daemon "$PORT")"
  fi
  # Some builds open the window slowly; also try activating the app once.
  /usr/bin/open -na "$CODEX_BUNDLE" --args --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" >/dev/null 2>&1 || true
  if ! wait_for_cdp "$PORT"; then
    [ -z "$INJECTOR_PID" ] || /bin/kill -TERM "$INJECTOR_PID" 2>/dev/null || true
    fail "Codex 未能在 45 秒内于本机端口 $PORT 打开可用的调试接口（CDP）。请确认已安装官方 ChatGPT/Codex，并查看 $APP_LOG 与 $APP_ERROR_LOG。"
  fi
fi

if [ "$FOREGROUND_INJECTOR" = "true" ]; then
  exec "$NODE" "$INJECTOR" --watch --port "$PORT" --theme-dir "$THEME_DIR"
fi

if [ -z "$INJECTOR_PID" ]; then
  INJECTOR_PID="$(launch_injector_daemon "$PORT")"
fi
/bin/sleep 0.15
/bin/kill -0 "$INJECTOR_PID" 2>/dev/null || fail "The injector exited during startup. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
[ -n "$INJECTOR_STARTED_AT" ] || fail "Could not record the injector process start time."
CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"

# Soft verify: keep the injector even if secondary selectors differ by Codex version.
# NOTE: Never expand an empty bash array as "${arr[@]}" under `set -u` on macOS
# /bin/bash 3.2 — it raises "unbound variable" and the GUI shows a false failure
# even after the skin has already started successfully.
if [ -n "$SKIN_MODE" ]; then
  "$NODE" "$INJECTOR" --once --enable-skin --skin-mode "$SKIN_MODE" --port "$PORT" --theme-dir "$THEME_DIR" \
    --timeout-ms 15000 >/dev/null 2>&1 || true
else
  "$NODE" "$INJECTOR" --once --enable-skin --port "$PORT" --theme-dir "$THEME_DIR" \
    --timeout-ms 15000 >/dev/null 2>&1 || true
fi

VERIFY_OUTPUT="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/qq-skin-verify.XXXXXX")"
/bin/chmod 600 "$VERIFY_OUTPUT"
cleanup_verify_output() { /bin/rm -f "$VERIFY_OUTPUT"; }
trap cleanup_verify_output EXIT
if "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 20000 >"$VERIFY_OUTPUT" 2>/dev/null; then
  verify_code=0
else
  verify_code=$?
fi
if [ "$verify_code" -ne 0 ]; then
  # One more force inject before giving up
  if [ -n "$SKIN_MODE" ]; then
    "$NODE" "$INJECTOR" --once --enable-skin --skin-mode "$SKIN_MODE" --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 15000 >/dev/null 2>&1 || true
  else
    "$NODE" "$INJECTOR" --once --enable-skin --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 15000 >/dev/null 2>&1 || true
  fi
  if "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 12000 >"$VERIFY_OUTPUT" 2>/dev/null; then
    verify_code=0
  else
    verify_code=$?
  fi
fi
if [ "$verify_code" -ne 0 ]; then
  # If CSS markers are present, treat as soft success (do not kill injector).
  if /usr/bin/grep -q '"installed": true' "$VERIFY_OUTPUT" 2>/dev/null; then
    printf 'Codex QQ Skin %s is active (soft verify) on port %s.\n' "$SKIN_VERSION" "$PORT"
    cleanup_verify_output
    trap - EXIT
    exit 0
  fi
  # The watcher is normally launched directly (launchctl is only a fallback),
  # so a successful `launchctl remove` does not prove that the recorded PID
  # stopped.  Verify the PID/path/start-time tuple before deleting state; if
  # it cannot be stopped safely, preserve the state as evidence and fail
  # closed instead of leaving an orphan watcher that can reinject later.
  if ! stop_recorded_injector; then
    cleanup_verify_output
    trap - EXIT
    fail "Injection verification failed and the recorded injector could not be stopped safely; state was preserved. See $INJECTOR_ERROR_LOG"
  fi
  /bin/rm -f "$STATE_PATH"
  cleanup_verify_output
  trap - EXIT
  fail "Injection verification failed. The injector was stopped; see $INJECTOR_ERROR_LOG"
fi
cleanup_verify_output
trap - EXIT

printf 'Codex QQ Skin %s is active on loopback port %s.\n' "$SKIN_VERSION" "$PORT"
