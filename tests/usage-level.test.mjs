import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  dailyGrowth,
  decomposeLevel,
  growthRequiredForLevel,
  levelForGrowth,
  levelProgress,
  tokenGrowthBonus,
} from "../scripts/usage/level-rules.mjs";
import { aggregateUsage, localDateKey } from "../scripts/usage/aggregate-usage.mjs";
import { sanitizeUsageSnapshot } from "../scripts/injector.mjs";

assert.equal(tokenGrowthBonus(9_999), 0);
assert.equal(tokenGrowthBonus(10_000), 0.25);
assert.equal(tokenGrowthBonus(100_000), 0.5);
assert.equal(tokenGrowthBonus(500_000), 0.75);
assert.equal(tokenGrowthBonus(2_000_000), 1);
assert.equal(dailyGrowth(50_000), 1.25);
assert.equal(dailyGrowth(99_000_000), 2);
assert.equal(dailyGrowth(99_000_000, false), 0);

for (const level of [0, 1, 3, 4, 15, 16, 32, 63, 64, 128]) {
  const required = growthRequiredForLevel(level);
  assert.equal(levelForGrowth(required), level);
  if (required > 0) assert.equal(levelForGrowth(required - 0.01), level - 1);
}
assert.deepEqual(decomposeLevel(27), { crowns: 0, suns: 1, moons: 2, stars: 3 });
assert.deepEqual(decomposeLevel(64), { crowns: 1, suns: 0, moons: 0, stars: 0 });
assert.equal(levelProgress(32).level, 4);
assert.equal(levelProgress(32).percent, 0);

const now = new Date(2026, 6, 22, 12, 0, 0, 0);
const yesterday = new Date(2026, 6, 21, 12, 0, 0, 0);
const aggregate = aggregateUsage({
  now,
  heartbeatDates: [localDateKey(now), localDateKey(yesterday)],
  buckets: [{
    bucketStart: yesterday.toISOString(),
    inputTokens: 400_000,
    outputTokens: 80_000,
    reasoningOutputTokens: 20_000,
    cachedInputTokens: 1_900_000,
  }],
  sessions: [{ sessionHash: "fixture" }],
});
assert.equal(aggregate.status, "ready");
assert.equal(aggregate.totals.lifetime.effectiveTokens, 500_000);
assert.equal(aggregate.totals.lifetime.cachedInputTokens, 1_900_000);
assert.equal(aggregate.totals.lifetime.totalTokens, 2_400_000);
assert.equal(aggregate.activity.activeDays, 2);
assert.equal(aggregate.activity.streakDays, 2);
assert.equal(aggregate.activity.sessionCount, 1);
assert.equal(aggregate.growth.points, 3);
assert.equal(aggregate.chart.length, 7);

const sanitized = sanitizeUsageSnapshot({
  schemaVersion: 99,
  status: "ready",
  totals: { today: { inputTokens: -1 }, week: {}, lifetime: { inputTokens: 2, outputTokens: 3, reasoningOutputTokens: 4 } },
  growth: { level: 27, percent: 999, icons: [{ kind: "crown", symbol: "♛" }, { kind: "bad", symbol: "x" }] },
  chart: new Array(20).fill({ date: "not-a-date", effectiveTokens: -10 }),
});
assert.equal(sanitized.totals.lifetime.effectiveTokens, 9);
assert.equal(sanitized.totals.lifetime.totalTokens, 9);
assert.equal(sanitized.growth.percent, 100);
assert.equal(sanitized.growth.icons[1].kind, "star");
assert.equal(sanitized.chart.length, 7);

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "codex-qq-usage-test-"));
try {
  const codexHome = path.join(fixtureRoot, "codex");
  const sessionDir = path.join(codexHome, "sessions", "2026", "07", "22");
  const stateDir = path.join(fixtureRoot, "usage");
  mkdirSync(sessionDir, { recursive: true });
  const timestamp = "2026-07-22T04:00:00.000Z";
  const usage = {
    input_tokens: 100_000,
    cached_input_tokens: 80_000,
    output_tokens: 10_000,
    reasoning_output_tokens: 2_000,
    total_tokens: 110_000,
  };
  const records = [
    { timestamp, type: "session_meta", payload: { id: "fixture-session", cwd: "/tmp/fixture", timestamp } },
    { timestamp, type: "turn_context", payload: { model: "gpt-fixture" } },
    { timestamp, type: "event_msg", payload: { type: "token_count", info: { model: "gpt-fixture", total_token_usage: { total_tokens: 110_000 }, last_token_usage: usage } } },
    { timestamp, type: "event_msg", payload: { type: "token_count", info: { model: "gpt-fixture", total_token_usage: { total_tokens: 110_000 }, last_token_usage: usage } } },
  ];
  writeFileSync(path.join(sessionDir, "rollout-fixture.jsonl"), `${records.map(JSON.stringify).join("\n")}\n`);
  const worker = path.resolve("scripts/usage/codex-usage-worker.mjs");
  const result = spawnSync(process.execPath, [worker, "--state-dir", stateDir, "--now", timestamp], {
    cwd: path.resolve("."),
    env: { ...process.env, CODEX_HOME: codexHome, CODEX_QQ_SKIN_CODEX_WORK_BUDGET_MS: "30000" },
    encoding: "utf8",
    timeout: 35_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.totals.lifetime.inputTokens, 20_000);
  assert.equal(snapshot.totals.lifetime.outputTokens, 8_000);
  assert.equal(snapshot.totals.lifetime.reasoningOutputTokens, 2_000);
  assert.equal(snapshot.totals.lifetime.cachedInputTokens, 80_000);
  assert.equal(snapshot.totals.lifetime.effectiveTokens, 30_000);
  assert.equal(snapshot.totals.lifetime.totalTokens, 110_000);
  assert.equal(snapshot.growth.points, 1.5);
  const persisted = JSON.parse(readFileSync(path.join(stateDir, "snapshot-v1.json"), "utf8"));
  assert.equal(persisted.totals.lifetime.effectiveTokens, 30_000);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("PASS: local Codex usage aggregation and QQ level rules are correct.");
