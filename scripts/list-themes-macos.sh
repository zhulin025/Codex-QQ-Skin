#!/bin/bash

# List saved theme packs under themes/ as JSON for the App and injector.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

JSON="false"
LIMIT=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --json) JSON="true"; shift ;;
    --limit) LIMIT="${2:-0}"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
case "$LIMIT" in ''|*[!0-9]*) fail "Invalid --limit: $LIMIT" ;; esac

ensure_state_root
ensure_node_runtime
/bin/mkdir -p "$THEMES_ROOT" "$IMAGES_DIR"

ACTIVE_NAME=""
ACTIVE_KIND=""
ACTIVE_LIBRARY_ID=""
if [ -f "$THEME_DIR/theme.json" ]; then
  ACTIVE_NAME="$("$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.name||"")}catch{}' "$THEME_DIR/theme.json" 2>/dev/null || true)"
  ACTIVE_KIND="$("$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.kind||"")}catch{}' "$THEME_DIR/theme.json" 2>/dev/null || true)"
fi

# Prefer matching the live theme.json against library packs by content hash of
# theme.json+image basename, falling back to name equality for older packs.
ACTIVE_HASH=""
if [ -f "$THEME_DIR/theme.json" ]; then
  ACTIVE_HASH="$(/usr/bin/shasum -a 256 "$THEME_DIR/theme.json" 2>/dev/null | /usr/bin/awk '{print $1}')"
fi

export STATE_ROOT THEMES_ROOT IMAGES_DIR THEME_DIR ACTIVE_NAME ACTIVE_KIND ACTIVE_HASH LIMIT
"$NODE" <<'NODE'
const fs = require("fs");
const path = require("path");

const themesRoot = process.env.THEMES_ROOT;
const imagesDir = process.env.IMAGES_DIR;
const themeDir = process.env.THEME_DIR;
const activeName = process.env.ACTIVE_NAME || "";
const activeKind = process.env.ACTIVE_KIND || "";
const activeHash = process.env.ACTIVE_HASH || "";
const limit = Number(process.env.LIMIT || 0);

function safeId(name) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(name);
}

function readTheme(dir) {
  const file = path.join(dir, "theme.json");
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const theme = JSON.parse(raw);
    const id = path.basename(dir);
    if (!safeId(id)) return null;
    const image = typeof theme.image === "string" ? path.basename(theme.image) : "";
    const hash = require("crypto").createHash("sha256").update(raw).digest("hex");
    const stat = fs.statSync(dir);
    return {
      id,
      name: typeof theme.name === "string" && theme.name.trim() ? theme.name.trim() : id,
      kind: theme.kind === "qq-stable" ? "qq-stable" : "custom-native",
      image,
      mtimeMs: stat.mtimeMs,
      hash,
    };
  } catch {
    return null;
  }
}

const themes = [];
if (fs.existsSync(themesRoot)) {
  for (const entry of fs.readdirSync(themesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const item = readTheme(path.join(themesRoot, entry.name));
    if (item) themes.push(item);
  }
}
themes.sort((a, b) => b.mtimeMs - a.mtimeMs);

let activeLibraryId = "";
if (activeHash) {
  const hit = themes.find((item) => item.hash === activeHash);
  if (hit) activeLibraryId = hit.id;
}
if (!activeLibraryId && activeName) {
  const hit = themes.find((item) => item.name === activeName);
  if (hit) activeLibraryId = hit.id;
}

const images = [];
if (fs.existsSync(imagesDir)) {
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
    if (entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("\0")) continue;
    images.push({
      basename: entry.name,
      path: path.join(imagesDir, entry.name),
    });
  }
  images.sort((a, b) => a.basename.localeCompare(b.basename));
}

const listed = limit > 0 ? themes.slice(0, limit) : themes;
const payload = {
  activeThemeName: activeName,
  activeThemeKind: activeKind || null,
  activeLibraryId: activeLibraryId || null,
  activeThemeDir: themeDir,
  themesRoot,
  imagesDir,
  themes: listed.map(({ id, name, kind, image, mtimeMs }) => ({
    id,
    name,
    kind,
    image,
    mtimeMs,
    active: id === activeLibraryId,
  })),
  images,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
NODE
