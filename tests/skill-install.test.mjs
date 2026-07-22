import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "install-deep-skin-skill.mjs");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "codex-skill-install-test-"));

function run(command) {
  const result = spawnSync(process.execPath, [script, command], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: temporary },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

try {
  assert.equal(run("status").installed, false);
  assert.equal(run("install").current, true);
  const status = run("status");
  assert.equal(status.installed, true);
  assert.equal(status.current, true);
  const installed = path.join(temporary, "skills", "codex-deep-skin-builder");
  assert.match(await fs.readFile(path.join(installed, "SKILL.md"), "utf8"), /name: codex-deep-skin-builder/);
  await fs.writeFile(path.join(installed, "SKILL.md"), "outdated\n");
  assert.equal(run("status").current, false);
  run("install");
  assert.equal(run("status").current, true);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log("PASS: the bundled deep-skin skill installs and updates atomically.");
