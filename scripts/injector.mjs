import fs from "node:fs/promises";
import { constants as fsConstants, watch as watchFs, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import { readImageMetadata } from "./image-metadata.mjs";
import { loadDeepThemeDirectory, mimeForExtension } from "./deep-theme-core.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SKIN_VERSION = "2.5.2";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_ART_BYTES = 16 * 1024 * 1024;
const MAX_USAGE_SNAPSHOT_BYTES = 256 * 1024;
const USAGE_REFRESH_INTERVAL_MS = 60_000;
let staticPayloadAssets = null;

async function persistActiveMode(themeDir, mode, themeId = null) {
  if (!themeDir || !["native", "qq", "custom"].includes(mode)) return;
  const file = path.join(resolveStateRoot(themeDir), "active-skin.json");
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify({
    schemaVersion: 1,
    mode,
    themeId: mode === "custom" && typeof themeId === "string" ? themeId : null,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(temporary, payload, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function parseArgs(argv) {
  const options = {
    port: 9341,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    enableSkin: false,
    skinMode: null,
    themeDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--check-payload") options.mode = "check";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--enable-skin") options.enableSkin = true;
    else if (arg === "--skin-mode") options.skinMode = String(argv[++i] || "");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.skinMode !== null && !["native", "qq", "custom"].includes(options.skinMode)) {
    throw new Error(`Invalid skin mode: ${options.skinMode}`);
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/page\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (
    url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port
    || url.username || url.password || url.search || url.hash || !pathIsValid
  ) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback page endpoint shape");
  }
  return url.href;
}

function isValidCdpPageTarget(item, port) {
  if (
    item?.type !== "page" || !item.url?.startsWith("app://")
    || typeof item.id !== "string" || !CDP_ID_PATTERN.test(item.id)
    || !item.webSocketDebuggerUrl
  ) return false;
  try {
    const debuggerUrl = new URL(validatedDebuggerUrl(item, port));
    return debuggerUrl.pathname === `/devtools/page/${item.id}`;
  } catch {
    return false;
  }
}

class CdpSession {
  constructor(target, port) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("error", () => this.close());
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      this.close();
      return;
    }
    if (!message || typeof message !== "object") {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      try { listener(message.params ?? {}); } catch (error) {
        console.error(`[qq-skin] CDP listener failed: ${error.message}`);
      }
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, timeoutMs = 10000) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function listAppTargets(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error("CDP target list was not an array");
    return targets.filter((item) => isValidCdpPageTarget(item, port));
  } finally {
    clearTimeout(timeout);
  }
}

async function probeSession(session) {
  return session.evaluate(`(() => {
    const markers = {
      shell: Boolean(document.querySelector('main.main-surface')),
      sidebar: Boolean(document.querySelector('aside.app-shell-left-panel')),
      composer: Boolean(document.querySelector('.composer-surface-chrome')),
      main: Boolean(document.querySelector('[role="main"]')),
    };
    return {
      title: document.title,
      href: location.href,
      markers,
      codex: markers.shell && markers.sidebar,
    };
  })()`);
}

async function waitForCodexProbe(session, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let probe = null;
  while (Date.now() < deadline) {
    probe = await probeSession(session);
    if (probe?.codex) return probe;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return probe;
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

async function connectCodexTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port);
      const connected = [];
      for (const target of targets) {
        let session;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else session.close();
        } catch (error) {
          session?.close();
          lastError = error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

function assertContainedPath(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside its theme directory`);
}

async function loadTheme(themeDir) {
  const requestedRoot = themeDir ?? path.join(root, "assets");
  const configPath = path.join(requestedRoot, "theme.json");
  let assetsRoot;
  let canonicalConfigPath;
  try {
    [assetsRoot, canonicalConfigPath] = await Promise.all([
      fs.realpath(requestedRoot),
      fs.realpath(configPath),
    ]);
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  assertContainedPath(assetsRoot, canonicalConfigPath, "Theme config");
  let config;
  try {
    config = await fs.readFile(canonicalConfigPath, "utf8");
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  const raw = JSON.parse(config);
  if (raw.schemaVersion === 2) {
    const loaded = await loadDeepThemeDirectory(assetsRoot);
    const background = loaded.assets.background;
    const theme = {
      ...loaded.theme,
      explicitColorKeys: Object.keys(loaded.theme.colors),
      image: background.filename,
      brandSubtitle: loaded.theme.brand.subtitle,
      tagline: loaded.theme.tagline,
      projectPrefix: "选择项目 · ",
      projectLabel: "选择项目",
      statusText: "DEEP SKIN ONLINE",
      quote: loaded.theme.brand.subtitle,
      sound: { enabled: true, volume: 0.48, completed: "cough", approval: "alert", online: "knock" },
    };
    return {
      art: background.bytes,
      assetsRoot,
      extension: background.extension,
      imagePath: path.join(assetsRoot, background.filename),
      theme,
      deepAssets: loaded.assets,
    };
  }
  if (raw.schemaVersion !== 1 || typeof raw.image !== "string" || !raw.image) {
    throw new Error(`${configPath} has an unsupported schema or image field`);
  }
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(raw.image)) {
    throw new Error(`${configPath} has an invalid image field`);
  }
  if (path.basename(raw.image) !== raw.image) throw new Error("Theme image must stay inside its theme directory");
  const text = (value, fallback, max, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value.trim() ? Array.from(value.trim()).slice(0, max).join("") : fallback;
  };
  const color = (value, fallback) => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalized) || /^rgba?\([0-9., %]+\)$/i.test(normalized)
      ? normalized
      : fallback;
  };
  const choice = (value, name, choices) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !choices.includes(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const unit = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const boundedNumber = (value, name, min, max) => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return Math.round(value);
  };
  const boolean = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new Error(`${configPath} has an invalid ${name} field`);
    return value;
  };
  const rawColors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)
    ? raw.colors : null;
  const colorKeys = [
    "background", "panel", "panelAlt", "accent", "accentAlt", "secondary",
    "highlight", "text", "muted", "line",
  ];
  const appearance = choice(raw.appearance, "appearance", ["auto", "light", "dark"]);
  const kind = choice(raw.kind, "kind", ["qq-stable", "custom-native"])
    ?? (String(raw.id || "").startsWith("preset-classic-") ? "qq-stable" : "custom-native");
  if (raw.art !== undefined && (!raw.art || typeof raw.art !== "object" || Array.isArray(raw.art))) {
    throw new Error(`${configPath} has an invalid art field`);
  }
  const rawArt = raw.art || {};
  const art = {
    focusX: unit(rawArt.focusX, "art.focusX"),
    focusY: unit(rawArt.focusY, "art.focusY"),
    safeArea: choice(rawArt.safeArea, "art.safeArea", ["auto", "left", "right", "center", "none"]),
    taskMode: choice(rawArt.taskMode, "art.taskMode", ["auto", "ambient", "banner", "off"]),
  };
  if (raw.layout !== undefined && (!raw.layout || typeof raw.layout !== "object" || Array.isArray(raw.layout))) {
    throw new Error(`${configPath} has an invalid layout field`);
  }
  const rawLayout = raw.layout || {};
  const layout = {
    mode: choice(rawLayout.mode, "layout.mode", ["classic-three-pane", "off"]) ?? "classic-three-pane",
    rightPanel: choice(rawLayout.rightPanel, "layout.rightPanel", ["open", "remember"]) ?? "open",
    minWidth: boundedNumber(rawLayout.minWidth, "layout.minWidth", 1080, 2400) ?? 1180,
    rightWidth: boundedNumber(rawLayout.rightWidth, "layout.rightWidth", 272, 360) ?? 300,
  };
  if (raw.sound !== undefined && (!raw.sound || typeof raw.sound !== "object" || Array.isArray(raw.sound))) {
    throw new Error(`${configPath} has an invalid sound field`);
  }
  const rawSound = raw.sound || {};
  const sound = {
    enabled: boolean(rawSound.enabled, "sound.enabled") ?? true,
    volume: unit(rawSound.volume, "sound.volume") ?? 0.48,
    completed: choice(rawSound.completed, "sound.completed", ["cough", "didi"]) ?? "cough",
    approval: choice(rawSound.approval, "sound.approval", ["alert", "didi"]) ?? "alert",
    online: choice(rawSound.online, "sound.online", ["knock", "didi"]) ?? "knock",
  };
  const theme = {
    schemaVersion: 1,
    kind,
    id: text(raw.id, "custom", 80, "id"),
    name: text(raw.name, "Codex QQ Skin", 80, "name"),
    brandSubtitle: text(raw.brandSubtitle, "CODEX QQ SKIN", 80, "brandSubtitle"),
    tagline: text(raw.tagline, "Make something wonderful.", 160, "tagline"),
    projectPrefix: text(raw.projectPrefix, "选择项目 · ", 80, "projectPrefix"),
    projectLabel: text(raw.projectLabel, "◉  选择项目", 80, "projectLabel"),
    statusText: text(raw.statusText, "QQ SKIN ONLINE", 80, "statusText"),
    quote: text(raw.quote, "MAKE SOMETHING WONDERFUL", 80, "quote"),
    image: raw.image,
    layout,
    sound,
    colorMode: rawColors ? "explicit" : "auto",
    explicitColorKeys: rawColors ? colorKeys.filter((key) => Object.hasOwn(rawColors, key)) : [],
    colors: {
      background: color(rawColors?.background, "#071116"),
      panel: color(rawColors?.panel, "#0b1a20"),
      panelAlt: color(rawColors?.panelAlt, "#10272c"),
      accent: color(rawColors?.accent, "#7cff46"),
      accentAlt: color(rawColors?.accentAlt, "#b8ff3d"),
      secondary: color(rawColors?.secondary, "#36d7e8"),
      highlight: color(rawColors?.highlight, "#642a8c"),
      text: color(rawColors?.text, "#e9fff1"),
      muted: color(rawColors?.muted, "#9ebdb3"),
      line: color(rawColors?.line, "rgba(124, 255, 70, .28)"),
    },
  };
  if (appearance !== undefined) theme.appearance = appearance;
  if (Object.values(art).some((value) => value !== undefined)) {
    theme.art = Object.fromEntries(Object.entries(art).filter(([, value]) => value !== undefined));
  }
  const requestedImagePath = path.join(assetsRoot, theme.image);
  let imagePath;
  try {
    imagePath = await fs.realpath(requestedImagePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Theme image is missing: ${requestedImagePath}`);
    throw error;
  }
  assertContainedPath(assetsRoot, imagePath, "Theme image");
  const imageStat = await fs.stat(imagePath);
  const extension = path.extname(theme.image).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported theme image format: ${extension || "missing"}`);
  }
  let imageHandle;
  try {
    imageHandle = await fs.open(imagePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ELOOP") throw new Error("Theme image changed into a symbolic link while loading");
    throw error;
  }
  try {
    const openedStat = await imageHandle.stat();
    if (
      !imageStat.isFile()
      || !openedStat.isFile()
      || imageStat.dev !== openedStat.dev
      || imageStat.ino !== openedStat.ino
      || openedStat.size < 1
      || openedStat.size > MAX_ART_BYTES
    ) {
      throw new Error(`Theme image must be a stable non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    const art = await imageHandle.readFile();
    if (art.length < 1 || art.length > MAX_ART_BYTES) {
      throw new Error(`Theme image must be a non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    return { art, assetsRoot, extension, imagePath, theme };
  } finally {
    await imageHandle.close();
  }
}

async function loadStaticPayloadAssets() {
  const cacheHit = Boolean(staticPayloadAssets);
  if (!staticPayloadAssets) {
    staticPayloadAssets = Promise.all([
      fs.readFile(path.join(root, "assets", "qq-skin.css"), "utf8"),
      fs.readFile(path.join(root, "assets", "custom-skin.css"), "utf8"),
      fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
      fs.readFile(path.join(root, "assets", "portal-hero.png")),
      fs.readFile(path.join(root, "assets", "theme.json"), "utf8"),
      fs.readFile(path.join(root, "assets", "codex-pet.png")),
      fs.readFile(path.join(root, "assets", "retro-window-frame.png")),
      fs.readFile(path.join(root, "assets", "qq-avatar.png")),
      fs.readFile(path.join(root, "assets", "audio", "qq-system-cough.mp3")),
    ]).catch((error) => {
      staticPayloadAssets = null;
      throw error;
    });
  }
  const [css, customCss, template, qqArt, qqThemeJson, pet, retroFrame, qqAvatar, coughAudio] = await staticPayloadAssets;
  const qqTheme = JSON.parse(qqThemeJson);
  return { css, customCss, template, qqArt, qqTheme, pet, retroFrame, qqAvatar, coughAudio, cacheHit };
}

function invalidateStaticPayloadAssets() {
  staticPayloadAssets = null;
}

function resolveStateRoot(themeDir) {
  if (themeDir) return path.dirname(path.resolve(themeDir));
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "CodexQQSkin");
  }
  return path.join(os.homedir(), "Library", "Application Support", "CodexQQSkin");
}

function finiteCount(value, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(max, Math.round(number));
}

function sanitizeUsageTotals(value) {
  const inputTokens = finiteCount(value?.inputTokens);
  const outputTokens = finiteCount(value?.outputTokens);
  const reasoningOutputTokens = finiteCount(value?.reasoningOutputTokens);
  const cachedInputTokens = finiteCount(value?.cachedInputTokens);
  const effectiveTokens = inputTokens + outputTokens + reasoningOutputTokens;
  return {
    inputTokens,
    outputTokens,
    reasoningOutputTokens,
    cachedInputTokens,
    effectiveTokens,
    totalTokens: effectiveTokens + cachedInputTokens,
  };
}

export function sanitizeUsageSnapshot(value) {
  const statuses = new Set(["loading", "indexing", "empty", "ready", "error"]);
  const status = statuses.has(value?.status) ? value.status : "error";
  const snapshot = {
    schemaVersion: 1,
    status,
    scope: "device",
    generatedAt: typeof value?.generatedAt === "string" && !Number.isNaN(Date.parse(value.generatedAt))
      ? value.generatedAt : new Date().toISOString(),
  };
  if (value?.stale === true) snapshot.stale = true;
  if (value?.error) snapshot.error = String(value.error).replace(/[\r\n]+/g, " ").slice(0, 160);
  if (value?.indexing && typeof value.indexing === "object") {
    snapshot.indexing = {
      phase: String(value.indexing.phase || "usage").slice(0, 32),
      completed: finiteCount(value.indexing.completed, 1_000_000),
      total: finiteCount(value.indexing.total, 1_000_000),
    };
  }
  if (value?.totals && typeof value.totals === "object") {
    snapshot.totals = {
      today: sanitizeUsageTotals(value.totals.today),
      week: sanitizeUsageTotals(value.totals.week),
      lifetime: sanitizeUsageTotals(value.totals.lifetime),
    };
  }
  if (value?.activity && typeof value.activity === "object") {
    snapshot.activity = {
      activeDays: finiteCount(value.activity.activeDays, 100_000),
      streakDays: finiteCount(value.activity.streakDays, 100_000),
      sessionCount: finiteCount(value.activity.sessionCount, 10_000_000),
    };
  }
  if (value?.growth && typeof value.growth === "object") {
    const level = finiteCount(value.growth.level, 10_000);
    snapshot.growth = {
      points: Math.max(0, Math.min(1_000_000_000, Number(value.growth.points) || 0)),
      level,
      remaining: Math.max(0, Math.min(1_000_000_000, Number(value.growth.remaining) || 0)),
      percent: finiteCount(value.growth.percent, 100),
      icons: Array.isArray(value.growth.icons) ? value.growth.icons.slice(0, 16).map((item) => ({
        kind: ["crown", "sun", "moon", "star"].includes(item?.kind) ? item.kind : "star",
        symbol: ["♛", "☀", "☾", "★"].includes(item?.symbol) ? item.symbol : "★",
      })) : [],
    };
  }
  snapshot.chart = Array.isArray(value?.chart) ? value.chart.slice(-7).map((item) => ({
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || "")) ? item.date : "",
    effectiveTokens: finiteCount(item?.effectiveTokens),
    totalTokens: finiteCount(item?.totalTokens) || finiteCount(item?.effectiveTokens),
  })) : [];
  return snapshot;
}

function runUsageWorker(themeDir) {
  const workerPath = path.join(root, "scripts", "usage", "codex-usage-worker.mjs");
  const usageDir = path.join(resolveStateRoot(themeDir), "usage");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, "--state-dir", usageDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      finish(new Error("Codex usage worker timed out"));
    }, 20_000);
    child.stdout.on("data", (chunk) => {
      if (stdout.length <= MAX_USAGE_SNAPSHOT_BYTES) stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16_384) stderr += String(chunk);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (stdout.length > MAX_USAGE_SNAPSHOT_BYTES) {
        finish(new Error("Codex usage worker returned an oversized snapshot"));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (code !== 0 && parsed?.status !== "error") throw new Error(stderr.trim() || `usage worker exited ${code}`);
        finish(null, sanitizeUsageSnapshot(parsed));
      } catch (error) {
        finish(new Error(stderr.trim() || error.message));
      }
    });
  });
}

async function pushUsageSnapshot(session, snapshot) {
  const safe = sanitizeUsageSnapshot(snapshot);
  return session.evaluate(`(() => {
    const snapshot = ${JSON.stringify(safe)};
    window.__CODEX_QQ_SKIN_USAGE_SNAPSHOT__ = snapshot;
    window.__CODEX_QQ_SKIN_STATE__?.setUsageSnapshot?.(snapshot);
    return true;
  })()`);
}

function listThemeLibrary(themeDir, { limit = 12, customOnly = false } = {}) {
  const stateRoot = resolveStateRoot(themeDir);
  const themesRoot = path.join(stateRoot, "themes");
  const liveThemePath = path.join(stateRoot, "theme", "theme.json");
  let activeHash = "";
  try {
    if (existsSync(liveThemePath)) {
      activeHash = createHash("sha256").update(readFileSync(liveThemePath)).digest("hex");
    }
  } catch {}
  if (!existsSync(themesRoot)) return [];
  const items = [];
  for (const entry of readdirSync(themesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(entry.name)) continue;
    const themePath = path.join(themesRoot, entry.name, "theme.json");
    if (!existsSync(themePath)) continue;
    try {
      const raw = readFileSync(themePath, "utf8");
      const theme = JSON.parse(raw);
      const kind = theme.kind === "qq-stable" ? "qq-stable"
        : theme.kind === "deep-custom" ? "deep-custom" : "custom-native";
      if (customOnly && kind === "qq-stable") continue;
      const hash = createHash("sha256").update(raw).digest("hex");
      const mtimeMs = statSync(path.join(themesRoot, entry.name)).mtimeMs;
      items.push({
        id: entry.name,
        name: typeof theme.name === "string" && theme.name.trim() ? theme.name.trim() : entry.name,
        kind,
        active: Boolean(activeHash && hash === activeHash),
        mtimeMs,
      });
    } catch {}
  }
  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items.slice(0, Math.max(1, limit)).map(({ id, name, kind, active }) => ({ id, name, kind, active }));
}

function runLibrarySwitch(themeId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(themeId || "")) {
    return Promise.reject(new Error(`Invalid theme id: ${themeId}`));
  }
  if (process.platform === "win32") {
    return Promise.reject(new Error("In-app library switching is currently macOS-only"));
  }
  const script = path.join(root, "scripts", "switch-theme-macos.sh");
  return new Promise((resolve, reject) => {
    // --no-apply only stages the live theme pack. The watch loop refreshes
    // the payload; never spawn a full start that would kill this injector.
    const child = spawn("/bin/bash", [script, "--id", themeId, "--no-apply"], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `switch-theme exited with ${code}`));
    });
  });
}

async function loadPayload(themeDir) {
  const startedAt = performance.now();
  const [staticAssets, loaded] = await Promise.all([
    loadStaticPayloadAssets(),
    loadTheme(themeDir),
  ]);
  const { css, customCss, template, qqArt, qqTheme, pet, retroFrame, qqAvatar, coughAudio } = staticAssets;
  const { art, extension, theme, deepAssets = {} } = loaded;
  const styleRevision = createHash("sha256").update(css).update(customCss).digest("hex").slice(0, 20);
  const artMetadata = readImageMetadata(art, extension);
  if (!artMetadata) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit");
  }
  const artKey = createHash("sha256").update(art).digest("hex").slice(0, 20);
  theme.artMetadata = artMetadata;
  theme.artKey = artKey;
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const artDataUrl = `data:${mime};base64,${art.toString("base64")}`;
  const qqArtDataUrl = `data:image/png;base64,${qqArt.toString("base64")}`;
  const petDataUrl = `data:image/png;base64,${pet.toString("base64")}`;
  const retroFrameDataUrl = `data:image/png;base64,${retroFrame.toString("base64")}`;
  const qqAvatarDataUrl = `data:image/png;base64,${qqAvatar.toString("base64")}`;
  const coughAudioDataUrl = `data:audio/mpeg;base64,${coughAudio.toString("base64")}`;
  const deepThemeAssets = Object.fromEntries(Object.entries(deepAssets)
    .filter(([key]) => key !== "background")
    .map(([key, asset]) => [key,
      `data:${mimeForExtension(asset.extension)};base64,${asset.bytes.toString("base64")}`]));
  const deepAssetRevision = Object.entries(deepAssets)
    .map(([key, asset]) => `${key}:${createHash("sha256").update(asset.bytes).digest("hex")}`)
    .join("|");
  const libraryThemes = listThemeLibrary(themeDir, { limit: 12, customOnly: true });
  const payload = template
    .replace("__QQ_SKIN_CSS_JSON__", JSON.stringify(css))
    .replace("__CUSTOM_SKIN_CSS_JSON__", JSON.stringify(customCss))
    .replace("__QQ_SKIN_ART_JSON__", JSON.stringify(artDataUrl))
    .replace("__QQ_STABLE_ART_JSON__", JSON.stringify(qqArtDataUrl))
    .replace("__QQ_SKIN_PET_JSON__", JSON.stringify(petDataUrl))
    .replace("__QQ_SKIN_RETRO_FRAME_JSON__", JSON.stringify(retroFrameDataUrl))
    .replace("__QQ_SKIN_QQ_AVATAR_JSON__", JSON.stringify(qqAvatarDataUrl))
    .replace("__QQ_SKIN_COUGH_AUDIO_JSON__", JSON.stringify(coughAudioDataUrl))
    .replace("__QQ_SKIN_DEEP_ASSETS_JSON__", JSON.stringify(deepThemeAssets))
    .replace("__QQ_SKIN_THEME_JSON__", JSON.stringify(theme))
    .replace("__QQ_STABLE_THEME_JSON__", JSON.stringify(qqTheme))
    .replace("__QQ_SKIN_LIBRARY_JSON__", JSON.stringify(libraryThemes))
    .replace("__QQ_SKIN_VERSION_JSON__", JSON.stringify(SKIN_VERSION))
    .replace("__QQ_SKIN_STYLE_REVISION_JSON__", JSON.stringify(styleRevision));
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(css)
    .update(customCss)
    .update(template)
    .update(qqArt)
    .update(JSON.stringify(qqTheme))
    .update(pet)
    .update(retroFrame)
    .update(qqAvatar)
    .update(coughAudio)
    .update(deepAssetRevision)
    .update(JSON.stringify(theme))
    .update(JSON.stringify(libraryThemes))
    .digest("hex")
    .slice(0, 20);
  return {
    imageBytes: art.length,
    petBytes: pet.length,
    frameBytes: retroFrame.length,
    qqAvatarBytes: qqAvatar.length,
    coughAudioBytes: coughAudio.length,
    deepAssetBytes: Object.values(deepAssets).reduce((sum, asset) => sum + asset.bytes.length, 0),
    payload,
    revision,
    theme,
    timings: {
      buildMs: Number((performance.now() - startedAt).toFixed(3)),
      staticCacheHit: staticAssets.cacheHit,
    },
  };
}

async function applyToSession(session, payload, { enableSkin = false, skinMode = null } = {}) {
  if (enableSkin) {
    await session.evaluate(`(() => {
      try { window.localStorage?.setItem("codex-qq-skin-enabled", "true"); } catch {}
      ${skinMode ? `try { window.localStorage?.setItem("codex-qq-skin-mode", ${JSON.stringify(skinMode)}); } catch {}` : ""}
      window.__CODEX_QQ_SKIN_DISABLED__ = false;
      return true;
    })()`);
  }
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_QQ_SKIN_DISABLED__ = true;
    const state = window.__CODEX_QQ_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-qq-skin');
    document.documentElement?.classList.remove('codex-dream-skin');
    document.documentElement?.style.removeProperty('--qq-skin-art');
    document.documentElement?.style.removeProperty('--dream-skin-art');
    document.documentElement?.style.removeProperty('--dream-retro-frame');
    document.documentElement?.style.removeProperty('--dream-summary-panel-width');
    document.getElementById('codex-qq-skin-style')?.remove();
    document.getElementById('codex-qq-skin-chrome')?.remove();
    document.getElementById('codex-qq-skin-companion')?.remove();
    document.getElementById('codex-qq-skin-usage-panel')?.remove();
    document.getElementById('codex-qq-skin-usage-toggle')?.remove();
    document.getElementById('codex-qq-skin-home-pet')?.remove();
    document.getElementById('codex-qq-skin-right-tray')?.remove();
    document.getElementById('codex-qq-skin-retro-shell')?.remove();
    document.getElementById('codex-qq-skin-retro-profile')?.remove();
    document.querySelectorAll('.dream-retro-profile-host').forEach((node) =>
      node.classList.remove('dream-retro-profile-host'));
    document.querySelectorAll('.dream-retro-window-control').forEach((button) =>
      button.classList.remove(
        'dream-retro-window-control', 'dream-retro-control-summary',
        'dream-retro-control-bottom', 'dream-retro-control-sidebar'));
    delete window.__CODEX_QQ_SKIN_STATE__;
    return true;
  })()`);
}

async function verifyRemovedSession(session) {
  return session.evaluate(`(() =>
    !document.documentElement.classList.contains('codex-qq-skin') &&
    !document.documentElement.classList.contains('codex-dream-skin') &&
    !document.getElementById('codex-qq-skin-style') &&
    !document.getElementById('codex-qq-skin-chrome') &&
    !document.getElementById('codex-qq-skin-companion') &&
    !document.getElementById('codex-qq-skin-usage-panel') &&
    !document.getElementById('codex-qq-skin-usage-toggle') &&
    !document.getElementById('codex-qq-skin-home-pet') &&
    !document.getElementById('codex-qq-skin-right-tray') &&
    !document.getElementById('codex-qq-skin-retro-shell') &&
    !window.__CODEX_QQ_SKIN_STATE__
  )()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    };
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const homeSignal = homeIndicator ?? document.querySelector('[data-feature="game-source"]') ??
      document.querySelector('.group\\\\/home-suggestions');
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    const home = document.querySelector('[role="main"].qq-skin-home, [role="main"].dream-skin-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cardBoxes = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const visibleCards = cardBoxes.filter((item) => item?.visible);
    const hero = box(home?.firstElementChild?.firstElementChild?.firstElementChild);
    const projectButton = box(home?.querySelector('.group\\\\/project-selector > button'));
    const shell = box(document.querySelector('main.main-surface'));
    const composer = box(document.querySelector('.composer-surface-chrome'));
    const sidebar = box(document.querySelector('aside.app-shell-left-panel'));
    const chrome = document.getElementById('codex-qq-skin-chrome');
    const usagePanelNode = document.getElementById('codex-qq-skin-usage-panel');
    const usageSnapshot = window.__CODEX_QQ_SKIN_USAGE_SNAPSHOT__;
    const result = {
      installed: document.documentElement.classList.contains('codex-qq-skin') ||
        document.documentElement.classList.contains('codex-dream-skin'),
      skinMode: window.__CODEX_QQ_SKIN_STATE__?.skinMode ?? null,
      version: window.__CODEX_QQ_SKIN_STATE__?.version ?? null,
      stylePresent: Boolean(document.getElementById('codex-qq-skin-style')),
      chromePresent: Boolean(chrome),
      chromePointerEvents: getComputedStyle(chrome || document.body).pointerEvents,
      homeRoute: Boolean(homeRoute),
      homePresent: Boolean(home),
      hero,
      cards: cardBoxes,
      visibleCardCount: visibleCards.length,
      projectButton,
      shell,
      composer,
      sidebar,
      usagePanel: box(usagePanelNode),
      usageMode: document.documentElement.getAttribute('data-qq-usage-mode'),
      usageStatus: usageSnapshot?.status ?? usagePanelNode?.dataset?.usageStatus ?? null,
      usageLevel: usageSnapshot?.growth?.level ?? null,
      usageToday: usageSnapshot?.totals?.today?.effectiveTokens ?? null,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const chromePass = result.skinMode === 'custom' || (result.chromePresent && result.chromePointerEvents === 'none');
    const basePass = result.installed && result.version === ${JSON.stringify(SKIN_VERSION)} &&
      result.stylePresent && chromePass &&
      Boolean(result.shell?.visible) && Boolean(result.sidebar?.visible) && !result.documentOverflow.x;
    // Project selector markup varies across Codex builds — soft requirement.
    const homePass = !result.homeRoute || (
      result.homePresent && result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120
    );
    result.pass = Boolean(basePass && homePass);
    result.softNotes = {
      projectButtonOptional: !result.projectButton?.visible,
      composerOptionalOnNonTaskRoutes: !result.composer?.visible,
      suggestionCardsOptional: result.homeRoute && result.visibleCardCount === 0,
    };
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const bestEffortInput = async (method, params) => {
    try {
      await session.send(method, params, 750);
    } catch {
      // Screenshot capture is still valid when a renderer omits the Input domain.
    }
  };
  await bestEffortInput("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  await bestEffortInput("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await bestEffortInput("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runOneShot(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const loaded = (options.mode === "once" || options.reload) ? await loadPayload(options.themeDir) : null;
  const payload = loaded?.payload ?? null;
  const results = [];
  let screenshotCaptured = false;

  for (const { target, session, probe } of connected) {
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") {
        await applyToSession(session, payload, { enableSkin: options.enableSkin, skinMode: options.skinMode });
      }

      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") {
          await applyToSession(session, payload, { enableSkin: options.enableSkin, skinMode: options.skinMode });
        }
      }

      const result = options.mode === "remove"
        ? await verifyRemovedSession(session)
        : await waitForVerifiedSession(session, options.timeoutMs);
      results.push({ targetId: target.id, title: target.title, url: target.url, probe, result });

      if (options.screenshot && !screenshotCaptured) {
        await capture(session, options.screenshot);
        screenshotCaptured = true;
      }
    } finally {
      session.close();
    }
  }

  console.log(JSON.stringify({ mode: options.mode, version: SKIN_VERSION, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) => options.mode === "remove" ? item.result !== true : !item.result?.pass);
  if (failed) process.exitCode = 2;
}

export function earlyPayloadFor(payload, revision) {
  return `(() => {
    const generationKey = "__CODEX_QQ_SKIN_EARLY_GENERATION__";
    const appliedKey = "__CODEX_QQ_SKIN_EARLY_APPLIED__";
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let observer = null;
    let timeout = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      if (!document.documentElement) return false;
      const shell = document.querySelector('main.main-surface');
      const sidebar = document.querySelector('aside.app-shell-left-panel');
      if (!shell || !sidebar) return false;
      stop();
      ${payload};
      window[appliedKey] = generation;
      return true;
    };
    if (install()) return;
    if (typeof MutationObserver === "function" && document.documentElement) {
      observer = new MutationObserver(install);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    timeout = setTimeout(stop, 10000);
  })()`;
}

function watchPayloadSources(themeDir, onDirty) {
  const assetsRoot = path.join(root, "assets");
  const themeRoot = themeDir ?? assetsRoot;
  const watchers = [];
  const add = (directory, kind) => {
    let watcher;
    try {
      watcher = watchFs(directory, { persistent: false }, (_event, filename) => {
        const name = filename ? String(filename) : "";
        const staticChanged = directory === assetsRoot &&
          (!name || name === "qq-skin.css" || name === "custom-skin.css" || name === "renderer-inject.js" ||
            name === "portal-hero.png" || name === "theme.json" ||
            name === "codex-pet.png" || name === "retro-window-frame.png" ||
            name === "qq-avatar.png" || name === "audio");
        if (kind === "static" && !staticChanged) return;
        onDirty({ staticChanged });
      });
      watcher.on("error", (error) => {
        console.error(`[qq-skin] file watch unavailable for ${directory}: ${error.message}`);
      });
      watchers.push(watcher);
    } catch (error) {
      console.error(`[qq-skin] file watch unavailable for ${directory}: ${error.message}`);
    }
  };
  add(themeRoot, "theme");
  if (themeRoot !== assetsRoot) {
    add(assetsRoot, "static");
    const themesRoot = path.join(path.dirname(path.resolve(themeRoot)), "themes");
    if (existsSync(themesRoot)) add(themesRoot, "theme");
  }
  return () => watchers.forEach((watcher) => watcher.close());
}

async function runWatch(options) {
  let current = await loadPayload(options.themeDir);
  const sessions = new Map();
  const rejected = new Set();
  let usageSnapshot = sanitizeUsageSnapshot({ status: "loading", generatedAt: new Date().toISOString() });
  let usageRefreshPromise = null;
  let nextUsageRefreshAt = 0;
  let stopping = false;
  let reloadTimer = null;
  let reloadChain = Promise.resolve();
  let persistedModeKey = "";
  let discoveryDelayMs = 100;
  let lastListErrorAt = 0;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const registerEarly = async (session, payload, revision) => {
    const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: earlyPayloadFor(payload, revision),
    });
    return result.identifier ?? null;
  };

  const removeEarly = async (record) => {
    if (!record.earlyScriptId || record.session.closed) return;
    const identifier = record.earlyScriptId;
    record.earlyScriptId = null;
    await record.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
  };

  const refreshUsage = async () => {
    try {
      usageSnapshot = await runUsageWorker(options.themeDir);
      for (const record of sessions.values()) {
        if (!record.session.closed) {
          await pushUsageSnapshot(record.session, usageSnapshot).catch((error) => {
            console.error(`[qq-skin] usage snapshot push failed: ${error.message}`);
          });
        }
      }
      console.log(`[qq-skin] refreshed local Codex usage (${usageSnapshot.status})`);
    } catch (error) {
      usageSnapshot = sanitizeUsageSnapshot({
        ...usageSnapshot,
        status: "error",
        stale: Boolean(usageSnapshot.totals),
        error: error.message,
        generatedAt: new Date().toISOString(),
      });
      console.error(`[qq-skin] usage refresh failed: ${error.message}`);
      for (const record of sessions.values()) {
        if (!record.session.closed) await pushUsageSnapshot(record.session, usageSnapshot).catch(() => {});
      }
    } finally {
      nextUsageRefreshAt = Date.now() + USAGE_REFRESH_INTERVAL_MS;
    }
  };

  const queueUsageRefresh = (force = false) => {
    if (usageRefreshPromise || (!force && Date.now() < nextUsageRefreshAt)) return usageRefreshPromise;
    usageRefreshPromise = refreshUsage().finally(() => { usageRefreshPromise = null; });
    return usageRefreshPromise;
  };

  const refreshPayload = async () => {
    const next = await loadPayload(options.themeDir);
    if (next.revision === current.revision) return;
    current = next;
    for (const record of sessions.values()) {
      const { session } = record;
      if (session.closed) continue;
      try {
        const nextIdentifier = await registerEarly(session, current.payload, current.revision);
        if (record.earlyScriptId) {
          await session.send("Page.removeScriptToEvaluateOnNewDocument", {
            identifier: record.earlyScriptId,
          }).catch(() => {});
        }
        record.earlyScriptId = nextIdentifier;
        record.needsLoadFallback = !nextIdentifier;
        await applyToSession(session, current.payload);
        await pushUsageSnapshot(session, usageSnapshot);
      } catch (error) {
        record.needsLoadFallback = true;
        console.error(`[qq-skin] theme refresh failed: ${error.message}`);
      }
    }
    console.log(`[qq-skin] refreshed theme ${current.theme.id} (${current.timings.buildMs}ms)`);
  };

  const queuePayloadRefresh = ({ staticChanged = false } = {}) => {
    if (staticChanged) invalidateStaticPayloadAssets();
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      reloadChain = reloadChain.then(refreshPayload).catch((error) => {
        console.error(`[qq-skin] theme reload failed: ${error.message}`);
      });
    }, 45);
  };
  const closePayloadWatchers = watchPayloadSources(options.themeDir, queuePayloadRefresh);
  let librarySwitchBusy = false;

  const pollUsageRefreshRequests = async () => {
    for (const record of sessions.values()) {
      if (record.session.closed) continue;
      let requested = false;
      try {
        requested = await record.session.evaluate(`(() => {
          try {
            const key = "codex-qq-skin-usage-refresh";
            const value = window.localStorage?.getItem(key);
            if (!value) return false;
            window.localStorage.removeItem(key);
            return true;
          } catch { return false; }
        })()`);
      } catch {}
      if (requested) {
        nextUsageRefreshAt = 0;
        queueUsageRefresh(true);
        return;
      }
    }
  };

  const pollLibrarySwitchRequests = async () => {
    if (librarySwitchBusy || process.platform === "win32" || !sessions.size) return;
    for (const record of sessions.values()) {
      if (record.session.closed) continue;
      let themeId = null;
      try {
        themeId = await record.session.evaluate(`(() => {
          try {
            const raw = window.localStorage?.getItem("codex-qq-skin-library-switch");
            if (!raw) return null;
            window.localStorage.removeItem("codex-qq-skin-library-switch");
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed.id === "string" ? parsed.id : null;
          } catch {
            return null;
          }
        })()`);
      } catch {
        continue;
      }
      if (!themeId) continue;
      librarySwitchBusy = true;
      try {
        await runLibrarySwitch(themeId);
        await record.session.evaluate(`try {
          window.localStorage?.setItem("codex-qq-skin-mode", "custom");
          window.localStorage?.setItem("codex-qq-skin-enabled", "true");
        } catch {}`).catch(() => {});
        await refreshPayload();
        console.log(`[qq-skin] applied library theme ${themeId}`);
      } catch (error) {
        console.error(`[qq-skin] library switch failed: ${error.message}`);
      } finally {
        librarySwitchBusy = false;
      }
      return;
    }
  };

  try {
    while (!stopping) {
      let targets = [];
      try {
        targets = await listAppTargets(options.port);
        discoveryDelayMs = 100;
      } catch (error) {
        if (Date.now() - lastListErrorAt >= 2000) {
          console.error(`[qq-skin] ${new Date().toISOString()} ${error.message}`);
          lastListErrorAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, discoveryDelayMs));
        discoveryDelayMs = Math.min(500, Math.round(discoveryDelayMs * 1.6));
        continue;
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const [id, record] of sessions) {
        if (!activeIds.has(id) || record.session.closed) {
          record.session.close();
          sessions.delete(id);
        }
      }

      for (const target of targets) {
        if (sessions.has(target.id)) continue;
        let session;
        let record;
        try {
          session = await connectTarget(target, options.port);
          record = { session, earlyScriptId: null, needsLoadFallback: false };
          try {
            record.earlyScriptId = await registerEarly(session, current.payload, current.revision);
            await session.evaluate(earlyPayloadFor(current.payload, current.revision));
          } catch (error) {
            record.needsLoadFallback = true;
            console.error(`[qq-skin] early injection unavailable: ${error.message}`);
          }
          const probe = await waitForCodexProbe(session);
          if (!probe?.codex) {
            await removeEarly(record);
            session.close();
            if (!rejected.has(target.id)) {
              console.error(`[qq-skin] rejected non-Codex app target ${target.id}`);
              rejected.add(target.id);
            }
            continue;
          }
          rejected.delete(target.id);
          session.on("Page.loadEventFired", () => {
            setTimeout(async () => {
              if (record.needsLoadFallback) {
                await applyToSession(session, current.payload).catch((error) => {
                  console.error(`[qq-skin] fallback reinject failed: ${error.message}`);
                });
              }
              await pushUsageSnapshot(session, usageSnapshot).catch(() => {});
            }, 0);
          });
          const earlyApplied = await session.evaluate(
            `window.__CODEX_QQ_SKIN_EARLY_APPLIED__ === ${JSON.stringify(current.revision)}`,
          );
          if (!earlyApplied) {
            await session.evaluate(
              `window.__CODEX_QQ_SKIN_EARLY_GENERATION__ = ${JSON.stringify(`fallback:${current.revision}`)}`,
            );
            await applyToSession(session, current.payload);
          }
          await pushUsageSnapshot(session, usageSnapshot);
          sessions.set(target.id, record);
          queueUsageRefresh(usageSnapshot.status === "loading");
          console.log(`[qq-skin] injected verified Codex target ${target.id} (${target.title || target.url})`);
        } catch (error) {
          if (record) await removeEarly(record);
          session?.close();
          console.error(`[qq-skin] inject failed for ${target.id}: ${error.message}`);
        }
      }
      await pollLibrarySwitchRequests();
      await pollUsageRefreshRequests();
      for (const record of sessions.values()) {
        if (record.session.closed) continue;
        try {
          const active = await record.session.evaluate(`(() => ({
            mode: window.__CODEX_QQ_SKIN_STATE__?.skinMode ?? null,
            themeId: window.__CODEX_QQ_SKIN_STATE__?.themeId ?? null
          }))()`);
          const key = `${active?.mode || ""}:${active?.themeId || ""}`;
          if (key !== persistedModeKey) {
            await persistActiveMode(options.themeDir, active?.mode, active?.themeId);
            persistedModeKey = key;
          }
          break;
        } catch {}
      }
      if (sessions.size) queueUsageRefresh(false);
      const pollDelay = sessions.size ? 800 : (targets.length ? 250 : 100);
      await new Promise((resolve) => setTimeout(resolve, pollDelay));
    }
  } finally {
    if (reloadTimer) clearTimeout(reloadTimer);
    closePayloadWatchers();
    await reloadChain.catch(() => {});
    await usageRefreshPromise?.catch(() => {});
    await Promise.all([...sessions.values()].map((record) => removeEarly(record)));
    for (const record of sessions.values()) record.session.close();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "check") {
      const loaded = await loadPayload(options.themeDir);
      console.log(JSON.stringify({
        pass: true,
        version: SKIN_VERSION,
        themeId: loaded.theme.id,
        themeName: loaded.theme.name,
        imageBytes: loaded.imageBytes,
        petBytes: loaded.petBytes,
        frameBytes: loaded.frameBytes,
        qqAvatarBytes: loaded.qqAvatarBytes,
        payloadBytes: Buffer.byteLength(loaded.payload),
        artMetadata: loaded.theme.artMetadata ?? null,
        timings: loaded.timings,
      }, null, 2));
    } else if (options.mode === "watch") await runWatch(options);
    else {
      await runOneShot(options);
      // Verification/removal/screenshot commands are one-shot helpers. Force
      // the CLI to release any idle CDP/fetch handles so the launcher cannot
      // leave a second injector process sitting beside the real watcher.
      process.exit(process.exitCode ?? 0);
    }
  } catch (error) {
    console.error(`[qq-skin] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}
