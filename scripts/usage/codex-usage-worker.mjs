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
import { parse as parseCodex } from "./vendor/codex.js";
import {
  SNAPSHOT_SCHEMA_VERSION,
  aggregateUsage,
  errorSnapshot,
  indexingSnapshot,
  localDateKey,
} from "./aggregate-usage.mjs";

const scriptPath = fileURLToPath(import.meta.url);

function defaultStateDir() {
  if (process.env.CODEX_QQ_SKIN_USAGE_DIR?.trim()) {
    return path.resolve(process.env.CODEX_QQ_SKIN_USAGE_DIR.trim());
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "CodexQQSkin", "usage");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim() || path.join(homedir(), "AppData", "Roaming");
    return path.join(appData, "CodexQQSkin", "usage");
  }
  return path.join(homedir(), ".codex-qq-skin", "usage");
}

function parseArgs(argv) {
  const options = { stateDir: defaultStateDir(), now: new Date(), pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--state-dir") options.stateDir = path.resolve(String(argv[++index] || ""));
    else if (arg === "--now") options.now = new Date(String(argv[++index] || ""));
    else if (arg === "--pretty") options.pretty = true;
    else throw new Error(`Unknown usage worker argument: ${arg}`);
  }
  if (!path.isAbsolute(options.stateDir)) throw new Error("Usage state directory must be absolute");
  if (Number.isNaN(options.now.getTime())) throw new Error("Usage worker --now is invalid");
  return options;
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try { return JSON.parse(readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, filePath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function normalizedHeartbeatDates(values, todayKey) {
  return [...new Set(Array.isArray(values) ? values : [])]
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(String(key)) && key <= todayKey)
    .sort();
}

export async function createUsageSnapshot({ stateDir = defaultStateDir(), now = new Date() } = {}) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const snapshotPath = path.join(stateDir, "snapshot-v1.json");
  const growthPath = path.join(stateDir, "growth-v1.json");
  const previous = readJson(snapshotPath, null);
  const growthState = readJson(growthPath, { schemaVersion: 1, heartbeatDates: [], highestGrowth: 0, highestLevel: 0 });
  const todayKey = localDateKey(now);
  const heartbeatDates = normalizedHeartbeatDates([...(growthState.heartbeatDates || []), todayKey], todayKey);

  process.env.CODEX_QQ_SKIN_CACHE_DIR = path.join(stateDir, "cache");
  if (!process.env.CODEX_QQ_SKIN_CODEX_WORK_BUDGET_MS) process.env.CODEX_QQ_SKIN_CODEX_WORK_BUDGET_MS = "12000";

  let snapshot;
  try {
    const parsed = await parseCodex();
    if (parsed?.skipped) {
      snapshot = indexingSnapshot(previous, parsed.indexing, now);
    } else {
      snapshot = aggregateUsage({
        buckets: parsed?.buckets || [],
        sessions: parsed?.sessions || [],
        heartbeatDates,
        now,
        highestGrowth: growthState.highestGrowth,
      });
      const nextGrowth = {
        schemaVersion: 1,
        heartbeatDates,
        highestGrowth: snapshot.growth.points,
        highestLevel: Math.max(Number(growthState.highestLevel) || 0, snapshot.growth.level),
        updatedAt: now.toISOString(),
      };
      writeJsonAtomic(growthPath, nextGrowth);
    }
  } catch (error) {
    snapshot = errorSnapshot(previous, error?.message, now);
  }

  if (snapshot?.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    snapshot = errorSnapshot(null, "usage snapshot schema mismatch", now);
  }
  writeJsonAtomic(snapshotPath, snapshot);
  return snapshot;
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const snapshot = await createUsageSnapshot(options);
    process.stdout.write(`${JSON.stringify(snapshot, null, options.pretty ? 2 : 0)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorSnapshot(null, error?.message))}\n`);
    process.exitCode = 1;
  }
}
