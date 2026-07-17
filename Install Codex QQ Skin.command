#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
exec "$ROOT/scripts/install-qq-skin-macos.sh"
