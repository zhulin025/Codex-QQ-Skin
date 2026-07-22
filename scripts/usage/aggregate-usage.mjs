import {
  dailyGrowth,
  levelProgress,
} from "./level-rules.mjs";

export const SNAPSHOT_SCHEMA_VERSION = 1;

function safeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(number));
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromLocalKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!match) return null;
  const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function shiftDateKey(key, days) {
  const date = dateFromLocalKey(key);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function emptyTotals() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    cachedInputTokens: 0,
    effectiveTokens: 0,
    totalTokens: 0,
  };
}

function addBucket(target, bucket) {
  target.inputTokens += safeCount(bucket.inputTokens);
  target.outputTokens += safeCount(bucket.outputTokens);
  target.reasoningOutputTokens += safeCount(bucket.reasoningOutputTokens);
  target.cachedInputTokens += safeCount(bucket.cachedInputTokens);
  target.effectiveTokens = target.inputTokens + target.outputTokens + target.reasoningOutputTokens;
  target.totalTokens = target.effectiveTokens + target.cachedInputTokens;
  return target;
}

function addTotals(target, source) {
  for (const key of Object.keys(target)) target[key] += safeCount(source[key]);
  return target;
}

export function aggregateUsage({ buckets = [], sessions = [], heartbeatDates = [], now = new Date(), highestGrowth = 0 } = {}) {
  const todayKey = localDateKey(now);
  const daily = new Map();
  for (const bucket of buckets) {
    const key = localDateKey(bucket.bucketStart);
    if (!key) continue;
    if (!daily.has(key)) daily.set(key, emptyTotals());
    addBucket(daily.get(key), bucket);
  }

  const activeDays = new Set([...daily.keys()]);
  for (const key of heartbeatDates) {
    if (dateFromLocalKey(key) && key <= todayKey) activeDays.add(key);
  }

  let computedGrowth = 0;
  for (const key of activeDays) {
    computedGrowth += dailyGrowth(daily.get(key)?.totalTokens || 0, true);
  }
  computedGrowth = Math.round(computedGrowth * 100) / 100;
  const growth = Math.max(Number(highestGrowth) || 0, computedGrowth);
  const level = levelProgress(growth);

  const today = daily.get(todayKey) || emptyTotals();
  const week = emptyTotals();
  const chart = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const key = shiftDateKey(todayKey, offset);
    const totals = daily.get(key) || emptyTotals();
    addTotals(week, totals);
    chart.push({ date: key, effectiveTokens: totals.effectiveTokens, totalTokens: totals.totalTokens });
  }
  const lifetime = emptyTotals();
  for (const totals of daily.values()) addTotals(lifetime, totals);

  let streakDays = 0;
  for (let offset = 0; ; offset -= 1) {
    const key = shiftDateKey(todayKey, offset);
    if (!activeDays.has(key)) break;
    streakDays += 1;
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    status: buckets.length ? "ready" : "empty",
    generatedAt: now.toISOString(),
    scope: "device",
    totals: { today, week, lifetime },
    activity: {
      activeDays: activeDays.size,
      streakDays,
      sessionCount: Array.isArray(sessions) ? sessions.length : 0,
    },
    growth: {
      points: growth,
      computedPoints: computedGrowth,
      ...level,
    },
    chart,
  };
}

export function indexingSnapshot(previous, indexing, now = new Date()) {
  if (previous?.schemaVersion === SNAPSHOT_SCHEMA_VERSION && previous?.totals) {
    return { ...previous, status: "indexing", stale: true, generatedAt: now.toISOString(), indexing: indexing || null };
  }
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    status: "indexing",
    generatedAt: now.toISOString(),
    scope: "device",
    indexing: indexing || null,
  };
}

export function errorSnapshot(previous, message, now = new Date()) {
  const safeMessage = String(message || "usage parser failed").replace(/[\r\n]+/g, " ").slice(0, 160);
  if (previous?.schemaVersion === SNAPSHOT_SCHEMA_VERSION && previous?.totals) {
    return { ...previous, status: "error", stale: true, generatedAt: now.toISOString(), error: safeMessage };
  }
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    status: "error",
    generatedAt: now.toISOString(),
    scope: "device",
    error: safeMessage,
  };
}
