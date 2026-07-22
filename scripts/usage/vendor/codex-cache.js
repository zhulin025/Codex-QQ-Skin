import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Parser caches are disposable derived data and never contain authoritative
// usage or growth state.
export const CODEX_CACHE_SCHEMA_VERSION = 1;
export const CODEX_PARSER_ALGORITHM_VERSION = 1;

function hash(value, length = 24) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

export function codexCacheEnabled() {
  return process.env.CODEX_QQ_SKIN_CODEX_CACHE !== '0';
}

export function fileSignature(stat) {
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    dev: String(stat.dev),
    ino: String(stat.ino),
  };
}

function sameSignature(a, b) {
  return a?.size === b.size
    && a?.mtimeMs === b.mtimeMs
    && a?.dev === b.dev
    && a?.ino === b.ino;
}

export function codexCacheDir(codexHome) {
  const base = process.env.CODEX_QQ_SKIN_CACHE_DIR?.trim()
    || join(homedir(), '.codex-qq-skin', 'cache');
  return join(base, 'codex', `root-${hash(codexHome)}`);
}

function entryPath(codexHome, filePath) {
  return join(codexCacheDir(codexHome), `${hash(filePath, 32)}.json`);
}

function tailPath(codexHome, filePath) {
  return join(codexCacheDir(codexHome), `${hash(filePath, 32)}.tail.json`);
}

export function loadCodexFileCache(codexHome, filePath, signature) {
  if (!codexCacheEnabled()) return null;
  const path = entryPath(codexHome, filePath);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed.schemaVersion !== CODEX_CACHE_SCHEMA_VERSION) return null;
    if (parsed.algorithmVersion !== CODEX_PARSER_ALGORITHM_VERSION) return null;
    if (parsed.filePath !== filePath) return null;
    if (signature && !sameSignature(parsed.signature, signature)) return null;
    return parsed;
  } catch {
    // Cache corruption is a performance miss, never a correctness failure.
    return null;
  }
}

export function saveCodexFileCache(codexHome, filePath, signature, data) {
  if (!codexCacheEnabled()) return;
  const dir = codexCacheDir(codexHome);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = entryPath(codexHome, filePath);
  const tempPath = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const payload = {
    schemaVersion: CODEX_CACHE_SCHEMA_VERSION,
    algorithmVersion: CODEX_PARSER_ALGORITHM_VERSION,
    filePath,
    signature,
    ...data,
  };
  try {
    writeFileSync(tempPath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tempPath, path);
  } finally {
    // A killed writer can leave a unique temp file; a normal failed writer
    // should not. rmSync is safe here because the target is this call's exact,
    // random temporary path inside the versioned cache directory.
    rmSync(tempPath, { force: true });
  }
}

export function loadCodexFileTail(codexHome, filePath) {
  if (!codexCacheEnabled()) return null;
  const path = tailPath(codexHome, filePath);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed.schemaVersion !== CODEX_CACHE_SCHEMA_VERSION) return null;
    if (parsed.algorithmVersion !== CODEX_PARSER_ALGORITHM_VERSION) return null;
    if (parsed.filePath !== filePath || !parsed.signature || !parsed.tail) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCodexFileTail(codexHome, filePath, signature, tail) {
  if (!codexCacheEnabled() || !tail) return;
  const dir = codexCacheDir(codexHome);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = tailPath(codexHome, filePath);
  const tempPath = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const payload = {
    schemaVersion: CODEX_CACHE_SCHEMA_VERSION,
    algorithmVersion: CODEX_PARSER_ALGORITHM_VERSION,
    filePath,
    signature,
    tail,
  };
  try {
    writeFileSync(tempPath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tempPath, path);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function removeCodexFileCache(codexHome, filePath) {
  if (!codexCacheEnabled()) return;
  rmSync(entryPath(codexHome, filePath), { force: true });
  rmSync(tailPath(codexHome, filePath), { force: true });
}
