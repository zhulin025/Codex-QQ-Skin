import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mac = await fs.readFile(path.join(root, "macos-app", "main.swift"), "utf8");
const windows = await fs.readFile(path.join(root, "windows-app", "Program.cs"), "utf8");
const windowsInstall = await fs.readFile(path.join(root, "scripts", "windows", "install-qq-skin-windows.ps1"), "utf8");

assert.match(mac, /VersionPolicy\.serverUpdateAvailable\(remote: release\.tag_name, current: self\.appVersion\)/,
  "macOS must require a strictly newer server release");
assert.match(mac, /\$0\.name == "Codex\.QQ\.Skin\.app\.zip"/,
  "macOS must select the exact release asset");
assert.match(mac, /VersionPolicy\.compare\(version, releaseTag\) == \.orderedSame/,
  "macOS must verify the staged app version matches the release tag");
assert.match(mac, /codesign[\s\S]{0,220}"--verify", "--deep", "--strict"/,
  "macOS must validate the staged app signature before replacement");
assert.match(mac, /ditto[\s\S]{0,220}codesign --verify --deep --strict[\s\S]{0,180}mv \"\$BACKUP\"/,
  "macOS must verify the copied app and roll back before deleting its backup");
assert.match(mac, /高于此安装器内置[\s\S]{0,80}不会降级/,
  "macOS must explain the installed-newer state");
assert.match(mac, /skillCurrent[\s\S]{0,180}✓ 已安装 Codex 深度皮肤助手[\s\S]{0,220}用法：在 Codex 输入/,
  "macOS must display current skill state and usage independently from installation");

assert.match(windows, /TryReleaseVersion\(release\.tag_name, out latest\)[\s\S]{0,180}latest <= current\) return/,
  "Windows must suppress equal and older releases");
assert.match(windows, /expectedName = "ChatGPT QQ Skin Setup " \+ latest\.ToString\(3\) \+ "\.exe"/,
  "Windows must select the exact versioned installer asset");
assert.match(windows, /FileVersionInfo\.GetVersionInfo\(target\)[\s\S]{0,320}downloadedVersion != latest/,
  "Windows must verify the downloaded installer version");
assert.match(windows, /bool current = installed && BundledSkillMatches\(skill\)[\s\S]{0,220}✓ 已安装 Codex 深度皮肤助手[\s\S]{0,180}用法：在 Codex 输入/,
  "Windows must display current skill state and usage independently from installation");
assert.match(windowsInstall, /\$installedVersion -gt \$bundledVersion[\s\S]{0,180}downgrade skipped/,
  "an older Windows installer must not downgrade a newer installed engine");
assert.match(windowsInstall, /\$installedVersion -eq \$bundledVersion -and \$installedComplete[\s\S]{0,180}replacement skipped/,
  "Windows must skip a complete equal-version engine replacement");

console.log("PASS: both installers enforce the complete update and skill-status flow.");
