import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const SCHEMA_VERSION = 1;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

function defaultStateDir() {
  if (process.env.CODEX_QQ_SKIN_COMPANION_DIR?.trim()) {
    return path.resolve(process.env.CODEX_QQ_SKIN_COMPANION_DIR.trim());
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "CodexQQSkin", "companion");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim() || path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, "CodexQQSkin", "companion");
  }
  return path.join(homedir(), ".codex-qq-skin", "companion");
}

function parseArgs(argv) {
  const options = { stateDir: defaultStateDir(), force: false, pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--state-dir") options.stateDir = path.resolve(String(argv[++index] || ""));
    else if (arg === "--force") options.force = true;
    else if (arg === "--pretty") options.pretty = true;
    else throw new Error(`Unknown companion worker argument: ${arg}`);
  }
  if (!path.isAbsolute(options.stateDir)) throw new Error("Companion state directory must be absolute");
  return options;
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try { return JSON.parse(readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, filePath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function text(value, limit) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Codex-QQ-Skin-Companion/1",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function chineseFallback(repo) {
  const language = repo.language && repo.language !== "Other" ? `使用 ${repo.language} 构建，` : "";
  const project = String(repo.name || "").split("/").pop() || "这个项目";
  return `${project} 是一个近期受到关注的开源项目，${language}帮助开发者改善开发流程、工具能力或自动化体验。`;
}

async function translateDescription(repo) {
  const source = text(repo.description, 160);
  if (!source) return chineseFallback(repo);
  if (/[\u3400-\u9fff]/.test(source)) return source;
  try {
    const query = new URLSearchParams({
      client: "gtx",
      sl: "auto",
      tl: "zh-CN",
      dt: "t",
      q: source,
    });
    const translated = await fetchJson(`https://translate.googleapis.com/translate_a/single?${query}`);
    const result = Array.isArray(translated?.[0])
      ? translated[0].map((part) => String(part?.[0] || "")).join("").replace(/\s+/g, " ").trim()
      : "";
    return /[\u3400-\u9fff]/.test(result) ? text(result, 220) : chineseFallback(repo);
  } catch {
    return chineseFallback(repo);
  }
}

async function fetchGithub(now) {
  const since = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const query = encodeURIComponent(`created:>${since} stars:>10 fork:false archived:false`);
  const data = await fetchJson(
    `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=12`,
  );
  const repos = (Array.isArray(data?.items) ? data.items : []).slice(0, 10).map((repo) => ({
    id: Number(repo?.id) || 0,
    name: text(repo?.full_name, 80),
    description: text(repo?.description, 160),
    url: /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(String(repo?.html_url || ""))
      ? String(repo.html_url) : "",
    language: text(repo?.language || "Other", 24),
    stars: Math.max(0, Number(repo?.stargazers_count) || 0),
    forks: Math.max(0, Number(repo?.forks_count) || 0),
    createdAt: typeof repo?.created_at === "string" ? repo.created_at : "",
  })).filter((repo) => repo.id && repo.name && repo.url);
  return Promise.all(repos.map(async (repo) => ({
    ...repo,
    descriptionZh: await translateDescription(repo),
  })));
}

function fallbackSnapshot(previous, error, now) {
  if (previous?.schemaVersion === SCHEMA_VERSION && previous?.github) {
    return {
      ...previous,
      status: "error",
      stale: true,
      error: text(error?.message || error, 160),
      checkedAt: now.toISOString(),
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "error",
    generatedAt: now.toISOString(),
    checkedAt: now.toISOString(),
    error: text(error?.message || error, 160),
    github: [],
  };
}

export async function createCompanionFeed({ stateDir = defaultStateDir(), force = false, now = new Date() } = {}) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const snapshotPath = path.join(stateDir, "feed-v1.json");
  const previous = readJson(snapshotPath);
  const previousTime = Date.parse(previous?.generatedAt || "");
  const translatedCache = Array.isArray(previous?.github) && previous.github.length > 0 &&
    previous.github.every((repo) => /[\u3400-\u9fff]/.test(String(repo?.descriptionZh || "")));
  if (!force && previous?.status === "ready" && translatedCache && Number.isFinite(previousTime) &&
      now.getTime() - previousTime < CACHE_MAX_AGE_MS) {
    const migrated = {
      schemaVersion: SCHEMA_VERSION,
      status: "ready",
      generatedAt: previous.generatedAt,
      checkedAt: now.toISOString(),
      cacheHit: true,
      github: Array.isArray(previous.github) ? previous.github : [],
    };
    writeJsonAtomic(snapshotPath, migrated);
    return migrated;
  }

  try {
    const github = await fetchGithub(now);
    if (!github.length) throw new Error("No GitHub projects were available");
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      status: "ready",
      generatedAt: now.toISOString(),
      checkedAt: now.toISOString(),
      github,
    };
    writeJsonAtomic(snapshotPath, snapshot);
    return snapshot;
  } catch (error) {
    const snapshot = fallbackSnapshot(previous, error, now);
    writeJsonAtomic(snapshotPath, snapshot);
    return snapshot;
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = await createCompanionFeed(options);
  process.stdout.write(`${JSON.stringify(snapshot, null, options.pretty ? 2 : 0)}\n`);
  if (snapshot.status === "error" && !snapshot.stale) process.exitCode = 1;
}
