#!/bin/bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
discover_codex_app
require_macos_runtime
exec "$RUNTIME_NODE" "$PROJECT_ROOT/scripts/install-deep-skin-skill.mjs" "${1:-install}"
