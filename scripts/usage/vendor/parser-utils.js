import { createHash } from "node:crypto";

export function roundToHalfHour(date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() < 30 ? 0 : 30, 0, 0);
  return value;
}

const MODEL_MAX_LENGTH = 100;
const PROJECT_MAX_LENGTH = 200;

function toTokenCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number);
}

export function aggregateToBuckets(entries) {
  const map = new Map();
  for (const entry of entries) {
    const model = String(entry.model || "unknown").slice(0, MODEL_MAX_LENGTH);
    const project = String(entry.project || "unknown").slice(0, PROJECT_MAX_LENGTH);
    const bucketStart = roundToHalfHour(entry.timestamp).toISOString();
    const key = `${entry.source}|${model}|${project}|${entry.hostname || ""}|${bucketStart}`;
    if (!map.has(key)) {
      map.set(key, {
        source: entry.source,
        model,
        project,
        ...(entry.hostname ? { hostname: entry.hostname } : {}),
        bucketStart,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningOutputTokens: 0,
      });
    }
    const bucket = map.get(key);
    bucket.inputTokens += entry.inputTokens || 0;
    bucket.outputTokens += entry.outputTokens || 0;
    bucket.cachedInputTokens += entry.cachedInputTokens || 0;
    bucket.reasoningOutputTokens += entry.reasoningOutputTokens || 0;
  }
  return [...map.values()].map((bucket) => {
    const inputTokens = toTokenCount(bucket.inputTokens);
    const outputTokens = toTokenCount(bucket.outputTokens);
    const cachedInputTokens = toTokenCount(bucket.cachedInputTokens);
    const reasoningOutputTokens = toTokenCount(bucket.reasoningOutputTokens);
    return {
      ...bucket,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      reasoningOutputTokens,
      totalTokens: inputTokens + outputTokens + reasoningOutputTokens,
    };
  });
}

export function extractSessions(events) {
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.sessionId)) groups.set(event.sessionId, []);
    groups.get(event.sessionId).push(event);
  }
  const sessions = [];
  for (const [sessionId, sessionEvents] of groups) {
    sessionEvents.sort((left, right) => left.timestamp - right.timestamp);
    const first = sessionEvents[0];
    const last = sessionEvents[sessionEvents.length - 1];
    const durationSeconds = Math.round((last.timestamp - first.timestamp) / 1000);
    let activeSeconds = 0;
    let turnStart = null;
    let turnEnd = null;
    let waitingForFirstResponse = false;
    for (const event of sessionEvents) {
      if (event.role === "user") {
        if (turnStart !== null && turnEnd !== null && turnEnd > turnStart) {
          activeSeconds += Math.round((turnEnd - turnStart) / 1000);
        }
        turnStart = null;
        turnEnd = null;
        waitingForFirstResponse = true;
      } else if (waitingForFirstResponse) {
        turnStart = event.timestamp;
        turnEnd = event.timestamp;
        waitingForFirstResponse = false;
      } else if (turnStart !== null) {
        turnEnd = event.timestamp;
      }
    }
    if (turnStart !== null && turnEnd !== null && turnEnd > turnStart) {
      activeSeconds += Math.round((turnEnd - turnStart) / 1000);
    }
    const userPromptHours = new Array(24).fill(0);
    let userMessageCount = 0;
    for (const event of sessionEvents) {
      if (event.role !== "user") continue;
      userMessageCount += 1;
      userPromptHours[event.timestamp.getUTCHours()] += 1;
    }
    sessions.push({
      source: first.source,
      project: first.project || "unknown",
      sessionHash: createHash("sha256").update(sessionId).digest("hex").slice(0, 16),
      firstMessageAt: first.timestamp.toISOString(),
      lastMessageAt: last.timestamp.toISOString(),
      durationSeconds,
      activeSeconds,
      messageCount: sessionEvents.length,
      userMessageCount,
      userPromptHours,
    });
  }
  return sessions;
}
