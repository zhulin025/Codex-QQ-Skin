import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDeepThemeDirectory } from "../scripts/deep-theme-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "scripts", "deep-theme.mjs");
const preset = path.join(root, "presets", "preset-bumblebee");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "codex-deep-theme-test-"));

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

try {
  const loaded = await loadDeepThemeDirectory(preset);
  assert.equal(loaded.theme.schemaVersion, 2);
  assert.equal(loaded.theme.kind, "deep-custom");
  assert.equal(loaded.assets.foregroundRight.metadata.width, 1024);

  const packageOne = path.join(temporary, "bumblebee-one.codexskin");
  const packageTwo = path.join(temporary, "bumblebee-two.codexskin");
  run("export", "--theme-dir", preset, "--out", packageOne);
  run("export", "--theme-dir", preset, "--out", packageTwo);
  assert.deepEqual(await fs.readFile(packageOne), await fs.readFile(packageTwo), "Exports must be deterministic");

  const state = path.join(temporary, "state");
  const imported = run("import", "--package", packageOne, "--state-root", state);
  assert.equal(imported.id, "preset-bumblebee");
  const installed = await loadDeepThemeDirectory(path.join(state, "themes", "preset-bumblebee"));
  assert.equal(installed.totalBytes, loaded.totalBytes);

  const undeclared = path.join(temporary, "undeclared");
  await fs.cp(preset, undeclared, { recursive: true });
  await fs.writeFile(path.join(undeclared, "payload.js"), "alert(1)\n");
  await assert.rejects(loadDeepThemeDirectory(undeclared), /undeclared entry/);

  const unsafeManifest = JSON.parse(await fs.readFile(path.join(preset, "theme.json"), "utf8"));
  unsafeManifest.customCss = "body { display: none }";
  await fs.writeFile(path.join(undeclared, "theme.json"), `${JSON.stringify(unsafeManifest)}\n`);
  await fs.rm(path.join(undeclared, "payload.js"));
  await assert.rejects(loadDeepThemeDirectory(undeclared), /unsupported field: customCss/);

  const linked = path.join(temporary, "linked");
  await fs.cp(preset, linked, { recursive: true });
  await fs.rm(path.join(linked, "watermark.png"));
  await fs.symlink(path.join(linked, "brand-emblem.png"), path.join(linked, "watermark.png"));
  await assert.rejects(loadDeepThemeDirectory(linked), /symbolic link|regular file/);

  const sourceAssets = path.join(temporary, "source-assets");
  await fs.mkdir(sourceAssets);
  for (const filename of Object.values(loaded.theme.assets)) {
    await fs.copyFile(path.join(preset, filename), path.join(sourceAssets, filename));
  }
  const manifest = path.join(temporary, "manifest.json");
  await fs.writeFile(manifest, `${JSON.stringify(loaded.theme, null, 2)}\n`);
  const created = path.join(temporary, "created");
  run("create", "--manifest", manifest, "--assets-dir", sourceAssets, "--out", created);
  assert.equal((await loadDeepThemeDirectory(created)).theme.id, "preset-bumblebee");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log("PASS: V2 deep themes validate, package deterministically, import safely, and reject unsafe entries.");
