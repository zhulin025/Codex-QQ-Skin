#!/usr/bin/env node

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  loadDeepThemeDirectory,
  MAX_THEME_TOTAL_BYTES,
  normalizeDeepTheme,
} from "./deep-theme-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (["no-apply"].includes(key)) options[key] = true;
    else options[key] = rest[++index];
  }
  return { command, options };
}

function requireOption(options, key) {
  const value = options[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function stateRoot(options) {
  if (options["state-root"]) return path.resolve(options["state-root"]);
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "CodexQQSkin");
  }
  return path.join(os.homedir(), "Library", "Application Support", "CodexQQSkin");
}

async function writeAtomic(filePath, bytes) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function copyLoadedTheme(loaded, destination) {
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const stage = path.join(parent, `.${path.basename(destination)}.stage-${process.pid}-${Date.now()}`);
  const backup = path.join(parent, `.${path.basename(destination)}.backup-${process.pid}-${Date.now()}`);
  await fs.mkdir(stage, { mode: 0o700 });
  try {
    for (const asset of Object.values(loaded.assets)) {
      await fs.writeFile(path.join(stage, asset.filename), asset.bytes, { flag: "wx", mode: 0o600 });
    }
    await fs.writeFile(path.join(stage, "theme.json"), loaded.configBytes, { flag: "wx", mode: 0o600 });
    let hadDestination = false;
    try {
      await fs.rename(destination, backup);
      hadDestination = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(stage, destination);
      if (hadDestination) await fs.rm(backup, { recursive: true, force: true });
    } catch (error) {
      if (hadDestination) await fs.rename(backup, destination).catch(() => {});
      throw error;
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    await fs.rm(backup, { recursive: true, force: true }).catch(() => {});
  }
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    table[value] = crc >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date(1980, 0, 1, 0, 0, 0)) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function makeStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.bytes);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

function readStoredZip(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { endOffset = index; break; }
  }
  if (endOffset < 0) throw new Error("Package is not a valid ZIP archive");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount < 1 || entryCount > 32 || centralOffset + centralSize > endOffset) {
    throw new Error("Package central directory is invalid");
  }
  const files = new Map();
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor < 0 || cursor + 46 > endOffset) throw new Error("Package central entry is truncated");
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Package central entry is invalid");
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error("Package must not contain symbolic links");
    if (cursor + 46 + nameLength + extraLength + commentLength > endOffset) {
      throw new Error("Package central entry is truncated");
    }
    if (method !== 0 || compressedSize !== size) throw new Error("Only stored .codexskin entries are supported");
    total += size;
    if (total > MAX_THEME_TOTAL_BYTES) throw new Error("Package expands beyond the 64 MB safety limit");
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name || path.basename(name) !== name || /[\\/|\u0000-\u001f\u007f]/u.test(name) || files.has(name)) {
      throw new Error(`Unsafe or duplicate package entry: ${name || "<empty>"}`);
    }
    if (localOffset < 0 || localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local entry for ${name}`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameEnd = localOffset + 30 + localNameLength;
    if (localNameEnd + localExtraLength > centralOffset) throw new Error(`Truncated local entry for ${name}`);
    if (buffer.subarray(localOffset + 30, localNameEnd).toString("utf8") !== name) {
      throw new Error(`Local and central names differ for package entry: ${name}`);
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + size;
    if (dataEnd > centralOffset) throw new Error(`Truncated package entry: ${name}`);
    const bytes = buffer.subarray(dataStart, dataEnd);
    if (crc32(bytes) !== expectedCrc) throw new Error(`Checksum mismatch for package entry: ${name}`);
    files.set(name, Buffer.from(bytes));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!files.has("theme.json")) throw new Error("Package is missing theme.json");
  return files;
}

async function unpackPackage(packagePath) {
  const bytes = await fs.readFile(packagePath);
  if (bytes.length > MAX_THEME_TOTAL_BYTES + 1024 * 1024) throw new Error("Package is larger than the safety limit");
  const files = readStoredZip(bytes);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "codexskin-import-"));
  try {
    for (const [name, data] of files) await fs.writeFile(path.join(temporary, name), data, { flag: "wx", mode: 0o600 });
    const loaded = await loadDeepThemeDirectory(temporary);
    return { temporary, loaded };
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function spawnChecked(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", env: process.env, windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited with ${code}`)));
  });
}

async function commandCreate(options) {
  const manifestPath = path.resolve(requireOption(options, "manifest"));
  const assetsDir = path.resolve(requireOption(options, "assets-dir"));
  const out = path.resolve(requireOption(options, "out"));
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const theme = normalizeDeepTheme(raw, manifestPath);
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "codexskin-create-"));
  try {
    for (const filename of Object.values(theme.assets)) {
      await fs.copyFile(path.join(assetsDir, filename), path.join(stage, filename), fsConstants.COPYFILE_EXCL);
    }
    await fs.writeFile(path.join(stage, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const loaded = await loadDeepThemeDirectory(stage);
    await copyLoadedTheme(loaded, out);
    process.stdout.write(`${JSON.stringify({ ok: true, command: "create", id: loaded.theme.id, path: out })}\n`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

async function commandValidate(options) {
  const loaded = await loadDeepThemeDirectory(path.resolve(requireOption(options, "theme-dir")));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    command: "validate",
    id: loaded.theme.id,
    name: loaded.theme.name,
    schemaVersion: loaded.theme.schemaVersion,
    assets: Object.fromEntries(Object.entries(loaded.assets).map(([key, asset]) => [key, {
      file: asset.filename, bytes: asset.bytes.length, width: asset.metadata.width, height: asset.metadata.height,
    }])),
    totalBytes: loaded.totalBytes,
  }, null, 2)}\n`);
}

async function commandExport(options) {
  const loaded = await loadDeepThemeDirectory(path.resolve(requireOption(options, "theme-dir")));
  const out = path.resolve(requireOption(options, "out"));
  if (path.extname(out).toLowerCase() !== ".codexskin") throw new Error("Export path must end in .codexskin");
  const files = [{ name: "theme.json", bytes: loaded.configBytes },
    ...Object.values(loaded.assets).map((asset) => ({ name: asset.filename, bytes: asset.bytes }))];
  await fs.mkdir(path.dirname(out), { recursive: true });
  await writeAtomic(out, makeStoredZip(files));
  process.stdout.write(`${JSON.stringify({ ok: true, command: "export", id: loaded.theme.id, path: out })}\n`);
}

async function installLoaded(loaded, options) {
  const themesRoot = path.join(stateRoot(options), "themes");
  const destination = path.join(themesRoot, loaded.theme.id);
  await copyLoadedTheme(loaded, destination);
  return destination;
}

async function commandInstall(options) {
  const loaded = await loadDeepThemeDirectory(path.resolve(requireOption(options, "theme-dir")));
  const destination = await installLoaded(loaded, options);
  process.stdout.write(`${JSON.stringify({ ok: true, command: "install", id: loaded.theme.id, path: destination })}\n`);
}

async function commandImport(options) {
  const extracted = await unpackPackage(path.resolve(requireOption(options, "package")));
  try {
    const destination = await installLoaded(extracted.loaded, options);
    process.stdout.write(`${JSON.stringify({ ok: true, command: "import", id: extracted.loaded.theme.id, path: destination })}\n`);
  } finally {
    await fs.rm(extracted.temporary, { recursive: true, force: true });
  }
}

async function commandApply(options) {
  const id = requireOption(options, "id");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid theme id");
  if (process.platform === "win32") {
    await spawnChecked("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(projectRoot, "scripts", "windows", "switch-theme-windows.ps1"), "-Id", id]);
  } else {
    await spawnChecked("/bin/bash", [path.join(projectRoot, "scripts", "switch-theme-macos.sh"), "--id", id]);
  }
}

async function commandVerify(options) {
  if (process.platform === "win32") {
    await spawnChecked("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(projectRoot, "scripts", "windows", "verify-qq-skin-windows.ps1")]);
  } else {
    await spawnChecked("/bin/bash", [path.join(projectRoot, "scripts", "doctor-macos.sh")]);
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "create") await commandCreate(options);
  else if (command === "validate") await commandValidate(options);
  else if (command === "export") await commandExport(options);
  else if (command === "import") await commandImport(options);
  else if (command === "install") await commandInstall(options);
  else if (command === "apply") await commandApply(options);
  else if (command === "verify") await commandVerify(options);
  else throw new Error("Usage: deep-theme.mjs <create|validate|export|import|install|apply|verify> [options]");
}

main().catch((error) => {
  process.stderr.write(`Codex deep theme: ${error.message}\n`);
  process.exitCode = 1;
});
