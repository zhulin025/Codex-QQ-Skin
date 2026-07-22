import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { readImageMetadata } from "./image-metadata.mjs";

export const DEEP_THEME_SCHEMA_VERSION = 2;
export const MAX_THEME_CONFIG_BYTES = 1024 * 1024;
export const MAX_THEME_ASSET_BYTES = 16 * 1024 * 1024;
export const MAX_THEME_TOTAL_BYTES = 64 * 1024 * 1024;
export const DEEP_ASSET_KEYS = [
  "background",
  "foregroundRight",
  "sidebarCharacter",
  "watermark",
  "brandEmblem",
  "avatar",
];

const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label} contains an unsupported field: ${key}`);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function safeText(value, fallback, limit, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
    throw new Error(`${label} must be a single-line string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > limit) throw new Error(`${label} must contain 1-${limit} characters`);
  return normalized;
}

function choice(value, fallback, allowed, label) {
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value)) throw new Error(`${label} has an unsupported value`);
  return value;
}

function finite(value, fallback, min, max, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return Number(value.toFixed(4));
}

function color(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || value.length > 64) throw new Error(`${label} is invalid`);
  const normalized = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized) &&
      !/^rgba?\(\s*\d{1,3}(?:\s*,\s*\d{1,3}){2}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(normalized)) {
    throw new Error(`${label} must be a six-digit hex color or rgb/rgba value`);
  }
  return normalized;
}

export function assertSafeAssetName(value, label = "asset") {
  if (typeof value !== "string" || !value || value.length > 160 || path.basename(value) !== value ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029\\/|]/u.test(value)) {
    throw new Error(`${label} must be a filename inside the theme directory`);
  }
  const extension = path.extname(value).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error(`${label} has an unsupported image extension`);
  return value;
}

function normalizeLayer(value, defaults, label, fields) {
  if (value === undefined || value === null) return { ...defaults };
  const raw = assertPlainObject(value, label);
  rejectUnknownKeys(raw, Object.keys(fields), label);
  const result = { ...defaults };
  for (const [field, [min, max]] of Object.entries(fields)) {
    result[field] = finite(raw[field], defaults[field], min, max, `${label}.${field}`);
  }
  return result;
}

export function normalizeDeepTheme(raw, label = "theme.json") {
  assertPlainObject(raw, label);
  rejectUnknownKeys(raw, [
    "schemaVersion", "kind", "id", "name", "tagline", "appearance",
    "assets", "brand", "colors", "layout", "art",
  ], label);
  if (raw.schemaVersion !== DEEP_THEME_SCHEMA_VERSION) {
    throw new Error(`${label} must use schemaVersion ${DEEP_THEME_SCHEMA_VERSION}`);
  }
  if (raw.kind !== "deep-custom") throw new Error(`${label} must use kind deep-custom`);
  const id = safeText(raw.id, "", 80, "id");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("id may contain only letters, numbers, underscores, and hyphens");
  const rawAssets = assertPlainObject(raw.assets, "assets");
  rejectUnknownKeys(rawAssets, DEEP_ASSET_KEYS, "assets");
  const assets = {};
  for (const key of DEEP_ASSET_KEYS) {
    if (rawAssets[key] !== undefined) assets[key] = assertSafeAssetName(rawAssets[key], `assets.${key}`);
  }
  if (!assets.background) throw new Error("assets.background is required");
  if (new Set(Object.values(assets)).size !== Object.values(assets).length) {
    throw new Error("Each deep theme asset must use a distinct filename");
  }

  const rawBrand = raw.brand === undefined ? {} : assertPlainObject(raw.brand, "brand");
  const rawColors = raw.colors === undefined ? {} : assertPlainObject(raw.colors, "colors");
  const rawLayout = raw.layout === undefined ? {} : assertPlainObject(raw.layout, "layout");
  const rawArt = raw.art === undefined ? {} : assertPlainObject(raw.art, "art");
  rejectUnknownKeys(rawBrand, ["title", "subtitle"], "brand");
  rejectUnknownKeys(rawColors, [
    "background", "panel", "panelAlt", "accent", "accentAlt", "secondary",
    "highlight", "text", "muted", "line",
  ], "colors");
  rejectUnknownKeys(rawLayout, ["foregroundRight", "sidebarCharacter", "watermark"], "layout");
  rejectUnknownKeys(rawArt, ["safeArea", "taskMode"], "art");
  const layout = {
    foregroundRight: normalizeLayer(rawLayout.foregroundRight, {
      width: 520, right: -24, bottom: -120, opacity: 1,
    }, "layout.foregroundRight", {
      width: [180, 1200], right: [-600, 600], bottom: [-700, 600], opacity: [0, 1],
    }),
    sidebarCharacter: normalizeLayer(rawLayout.sidebarCharacter, {
      size: 138, positionY: 22, opacity: 0.075,
    }, "layout.sidebarCharacter", {
      size: [50, 260], positionY: [0, 100], opacity: [0, 0.5],
    }),
    watermark: normalizeLayer(rawLayout.watermark, {
      width: 170, positionX: 56, positionY: 8, opacity: 0.1,
    }, "layout.watermark", {
      width: [40, 600], positionX: [0, 100], positionY: [0, 100], opacity: [0, 0.5],
    }),
  };
  const colors = {
    background: color(rawColors.background, "#fbfaf6", "colors.background"),
    panel: color(rawColors.panel, "#fffefa", "colors.panel"),
    panelAlt: color(rawColors.panelAlt, "#fff8d9", "colors.panelAlt"),
    accent: color(rawColors.accent, "#f2b705", "colors.accent"),
    accentAlt: color(rawColors.accentAlt, "#ffd64a", "colors.accentAlt"),
    secondary: color(rawColors.secondary, "#e7a900", "colors.secondary"),
    highlight: color(rawColors.highlight, "#ffc400", "colors.highlight"),
    text: color(rawColors.text, "#24231f", "colors.text"),
    muted: color(rawColors.muted, "#716e63", "colors.muted"),
    line: color(rawColors.line, "rgba(222, 169, 0, .30)", "colors.line"),
  };
  return {
    schemaVersion: DEEP_THEME_SCHEMA_VERSION,
    kind: "deep-custom",
    id,
    name: safeText(raw.name, "深度 Codex 皮肤", 80, "name"),
    tagline: safeText(raw.tagline, "把一句灵感变成可交互的 Codex 工作台。", 160, "tagline"),
    appearance: choice(raw.appearance, "light", ["light", "dark", "auto"], "appearance"),
    assets,
    brand: {
      title: safeText(rawBrand.title, "CODEX", 32, "brand.title"),
      subtitle: safeText(rawBrand.subtitle, "MORE THAN CODE", 64, "brand.subtitle"),
    },
    colors,
    layout,
    art: {
      safeArea: choice(rawArt.safeArea, "center", ["left", "right", "center", "none"], "art.safeArea"),
      taskMode: choice(rawArt.taskMode, "ambient", ["ambient", "banner", "off"], "art.taskMode"),
    },
  };
}

function sameStat(left, right) {
  return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export async function readStableThemeFile(filePath, label, maxBytes) {
  const pathBefore = await fs.lstat(filePath);
  if (pathBefore.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if (!pathBefore.isFile()) throw new Error(`${label} must be a regular file`);
  let handle;
  try {
    handle = await fs.open(filePath, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") throw new Error(`${label} must not be a symbolic link`);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!sameStat(pathBefore, before)) throw new Error(`${label} changed before it was read`);
    if (before.size < 1 || before.size > maxBytes) throw new Error(`${label} must be non-empty and no larger than ${maxBytes} bytes`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const pathAfter = await fs.lstat(filePath);
    if (!sameStat(before, after) || !sameStat(after, pathAfter)) throw new Error(`${label} changed while it was read`);
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function loadDeepThemeDirectory(directory) {
  const root = await fs.realpath(directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error("Theme root must be a directory");
  const configBytes = await readStableThemeFile(path.join(root, "theme.json"), "theme.json", MAX_THEME_CONFIG_BYTES);
  let raw;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(configBytes));
  } catch {
    throw new Error("theme.json is not valid UTF-8 JSON");
  }
  const theme = normalizeDeepTheme(raw, path.join(root, "theme.json"));
  const declared = new Set(["theme.json", ...Object.values(theme.assets)]);
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!declared.has(entry.name)) throw new Error(`Theme contains an undeclared entry: ${entry.name}`);
    if (!entry.isFile()) throw new Error(`Theme entry must be a regular file: ${entry.name}`);
  }
  const loadedAssets = {};
  let totalBytes = configBytes.length;
  for (const [key, filename] of Object.entries(theme.assets)) {
    const filePath = path.join(root, filename);
    const pathStat = await fs.lstat(filePath).catch((error) => {
      if (error.code === "ENOENT") throw new Error(`Missing declared asset: ${filename}`);
      throw error;
    });
    if (pathStat.isSymbolicLink()) throw new Error(`assets.${key} must not be a symbolic link`);
    if (!pathStat.isFile()) throw new Error(`assets.${key} must be a regular file`);
    const resolved = await fs.realpath(filePath).catch((error) => {
      if (error.code === "ENOENT") throw new Error(`Missing declared asset: ${filename}`);
      throw error;
    });
    const relative = path.relative(root, resolved);
    if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error(`Asset escapes the theme directory: ${filename}`);
    }
    const bytes = await readStableThemeFile(filePath, `assets.${key}`, MAX_THEME_ASSET_BYTES);
    totalBytes += bytes.length;
    if (totalBytes > MAX_THEME_TOTAL_BYTES) throw new Error(`Theme exceeds ${MAX_THEME_TOTAL_BYTES} total bytes`);
    const extension = path.extname(filename).toLowerCase();
    const metadata = readImageMetadata(bytes, extension);
    if (!metadata) throw new Error(`Asset has invalid image data or dimensions: ${filename}`);
    loadedAssets[key] = { bytes, extension, filename, metadata };
  }
  return { root, configBytes, theme, assets: loadedAssets, totalBytes };
}

export function mimeForExtension(extension) {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}
