#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "skills", "codex-deep-skin-builder");
const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
const destination = path.join(codexHome, "skills", "codex-deep-skin-builder");

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function sameVersion() {
  try {
    const [bundled, installed] = await Promise.all([
      fs.readFile(path.join(source, "SKILL.md")),
      fs.readFile(path.join(destination, "SKILL.md")),
    ]);
    return bundled.equals(installed);
  } catch { return false; }
}

async function install() {
  if (!await exists(path.join(source, "SKILL.md"))) throw new Error(`Bundled skill is missing: ${source}`);
  const parent = path.dirname(destination);
  const stage = path.join(parent, `.codex-deep-skin-builder.stage-${process.pid}-${Date.now()}`);
  const backup = path.join(parent, `.codex-deep-skin-builder.backup-${process.pid}-${Date.now()}`);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  await fs.cp(source, stage, { recursive: true, errorOnExist: true, force: false });
  let hadDestination = false;
  try {
    try { await fs.rename(destination, backup); hadDestination = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
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
  return { installed: true, current: true, path: destination };
}

const command = process.argv[2] || "status";
let result;
if (command === "install") result = await install();
else if (command === "status") result = {
  installed: await exists(path.join(destination, "SKILL.md")),
  current: await sameVersion(),
  path: destination,
};
else throw new Error("Usage: install-deep-skin-skill.mjs <status|install>");
process.stdout.write(`${JSON.stringify({ ok: true, command, ...result })}\n`);
