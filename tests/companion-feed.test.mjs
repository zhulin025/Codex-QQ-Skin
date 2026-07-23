import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCompanionFeed } from "../scripts/companion/companion-feed-worker.mjs";

const injectorSource = await fs.readFile(new URL("../scripts/injector.mjs", import.meta.url), "utf8");
assert.match(
  injectorSource,
  /async function runOneShot[\s\S]*runCompanionWorker\(options\.themeDir\)[\s\S]*pushCompanionSnapshot\(session, companionSnapshot\)/,
  "One-shot and hot-apply injection must deliver the cached companion snapshot without depending on the watcher.",
);

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-companion-feed-"));
const now = new Date("2026-07-23T08:00:00.000Z");
try {
  await fs.writeFile(path.join(stateDir, "feed-v1.json"), `${JSON.stringify({
    schemaVersion: 1,
    status: "ready",
    generatedAt: "2026-07-23T07:30:00.000Z",
    github: [{
      id: 1,
      name: "fixture/garden",
      description: "Fixture garden",
      descriptionZh: "一个用于测试项目盲盒缓存的示例项目。",
      url: "https://github.com/fixture/garden",
      language: "JavaScript",
      stars: 42,
      forks: 3,
    }],
  })}\n`);
  const snapshot = await createCompanionFeed({ stateDir, now });
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.cacheHit, true);
  assert.equal(snapshot.github[0].name, "fixture/garden");
  assert.match(snapshot.github[0].descriptionZh, /[\u3400-\u9fff]/);
  assert.equal("news" in snapshot, false);
  assert.equal("videos" in snapshot, false);
} finally {
  await fs.rm(stateDir, { recursive: true, force: true });
}

console.log("PASS: companion feed caches only the GitHub project source used by blind boxes.");
