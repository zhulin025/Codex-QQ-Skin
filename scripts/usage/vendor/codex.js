import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { aggregateToBuckets } from './parser-utils.js';
import {
  codexCacheEnabled,
  fileSignature,
  loadCodexFileCache,
  loadCodexFileTail,
  saveCodexFileCache,
  saveCodexFileTail,
} from './codex-cache.js';

// Codex stores live sessions in $CODEX_HOME/sessions (default ~/.codex) and,
// once a session is "completed", moves its rollout file verbatim into
// $CODEX_HOME/archived_sessions. A session can be archived between two syncs,
// so scanning only the live dir loses that session's usage forever. We scan
// both, index them together so fork replay-skip works across directories, and
// select the most complete physical file when the same session briefly exists
// in both locations during an archive move.
function getCodexHome() {
  return process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
}

function sessionsDirs(codexHome) {
  return [
    join(codexHome, 'sessions'),
    join(codexHome, 'archived_sessions'),
  ];
}

/**
 * Recursively find all .jsonl files under a directory.
 * Codex CLI stores sessions as: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */
function findJsonlFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return results;
}

function readLines(filePath, snapshotSize, start = 0) {
  return createInterface({
    input: createReadStream(filePath, {
      encoding: 'utf-8',
      // Rollouts are append-only while Codex is working. Bound both parser
      // passes to the size captured before pass 1 so they see the same prefix
      // even when the live file grows between reads.
      ...(start > 0 ? { start } : {}),
      ...(snapshotSize == null ? {} : { end: snapshotSize - 1 }),
    }),
    crlfDelay: Infinity,
  });
}

function extractProject(meta) {
  if (meta.git?.repository_url) {
    // e.g. https://github.com/org/repo.git → org/repo
    const match = meta.git.repository_url.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  }
  if (meta.cwd) return meta.cwd.split('/').pop() || 'unknown';
  return 'unknown';
}

/**
 * A sub-agent rollout (spawned thread / guardian / collab agent). Depending
 * on the Codex version the marker is `thread_source: "subagent"`, a
 * `source: { subagent: {...} }` object, or just a `parent_thread_id` — check
 * all three so no version's sub-agents slip through as normal sessions.
 */
function isSubagentMeta(meta) {
  if (meta.thread_source === 'subagent') return true;
  const src = meta.source;
  if (src === 'subagent') return true;
  if (src && typeof src === 'object' && 'subagent' in src) return true;
  return meta.parent_thread_id != null;
}

function extractParentThreadId(meta) {
  return meta.parent_thread_id
    || meta.source?.subagent?.thread_spawn?.parent_thread_id
    || null;
}

/**
 * Read only far enough to find the canonical (first) session_meta. This cheap
 * discovery pass lets ordinary sessions skip the old full-file index pass;
 * only forks, sub-agents, and parents referenced by them need replay indexes.
 */
async function readSessionHeader(filePath, snapshotSize) {
  for await (const line of readLines(filePath, snapshotSize)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'session_meta' || !obj.payload) continue;
      const meta = obj.payload;
      return {
        sessionId: meta.id || null,
        forkedFromId: meta.forked_from_id || null,
        parentThreadId: extractParentThreadId(meta),
        sessionProject: extractProject(meta),
        sessionStartedAtMs: timestampMs(meta.timestamp) ?? timestampMs(obj.timestamp),
        isSubagent: isSubagentMeta(meta),
      };
    } catch {
      continue;
    }
  }
  return {
    sessionId: null,
    forkedFromId: null,
    parentThreadId: null,
    sessionProject: 'unknown',
    sessionStartedAtMs: null,
    isSubagent: false,
  };
}

function cacheData(cache, changes = {}) {
  return {
    header: changes.header ?? cache?.header ?? null,
    index: changes.index ?? cache?.index ?? null,
    result: changes.result ?? cache?.result ?? null,
    lastAuditedAt: changes.lastAuditedAt ?? cache?.lastAuditedAt ?? null,
  };
}

const TAIL_GUARD_BYTES = 4096;

function snapshotGuard(filePath, size) {
  if (size <= 0) return { hash: null, endsWithNewline: false };
  const length = Math.min(size, TAIL_GUARD_BYTES);
  const buffer = Buffer.allocUnsafe(length);
  const fd = openSync(filePath, 'r');
  try {
    const read = readSync(fd, buffer, 0, length, size - length);
    const slice = buffer.subarray(0, read);
    return {
      hash: createHash('sha256').update(slice).digest('base64url').slice(0, 20),
      endsWithNewline: slice.at(-1) === 0x0a,
    };
  } finally {
    closeSync(fd);
  }
}

function tailStateFor(file) {
  const prior = file.priorTail;
  const tail = prior?.tail;
  if (!tail || !prior.signature) return null;
  if (prior.signature.size <= 0 || prior.signature.size >= file.signature.size) return null;
  if (prior.signature.dev !== file.signature.dev || prior.signature.ino !== file.signature.ino) return null;
  if (prior.signature.mtimeMs > file.signature.mtimeMs) return null;
  if (tail.parsedBytes !== prior.signature.size || !tail.endsWithNewline || !tail.guardHash) return null;
  try {
    const guard = snapshotGuard(file.filePath, prior.signature.size);
    return guard.hash === tail.guardHash ? tail : null;
  } catch {
    return null;
  }
}

function timestampMs(value) {
  if (value == null || value === '') return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function epochMs(value) {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value < 1e12 ? value * 1000 : value;
}

function isTaskStarted(payload) {
  return payload?.type === 'task_started' || payload?.type === 'turn_started';
}

function upperBound(sorted, target) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (sorted[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function tokenFingerprint(payload) {
  // Copied rollout items are re-serialized with a fresh outer timestamp, but
  // their token_count payload is unchanged. A compact payload hash therefore
  // identifies replayed records without retaining raw usage objects in memory.
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('base64url')
    .slice(0, 16);
}

/**
 * Return the longest prefix of `child` that is also a suffix of `parent`.
 * Codex can fork full history or the last N turns, but the copied block always
 * reaches the source snapshot's end. Requiring the suffix prevents a child's
 * coincidentally repeated payload from matching an unrelated interior turn.
 * KMP keeps this linear even when many token payloads are identical.
 */
function longestReplayPrefix(child, parent) {
  if (child.length === 0 || parent.length === 0) return 0;

  const prefix = new Array(child.length).fill(0);
  for (let i = 1, matched = 0; i < child.length; i++) {
    while (matched > 0 && child[i] !== child[matched]) matched = prefix[matched - 1];
    if (child[i] === child[matched]) matched++;
    prefix[i] = matched;
  }

  let matched = 0;
  for (let i = 0; i < parent.length; i++) {
    const fingerprint = parent[i];
    while (matched > 0 && fingerprint !== child[matched]) matched = prefix[matched - 1];
    if (fingerprint === child[matched]) matched++;
    if (matched === child.length && i < parent.length - 1) matched = prefix[matched - 1];
  }
  return matched;
}

/**
 * Return the longest prefix of `child` found contiguously anywhere in
 * `parent`. A live sub-agent rollout can be observed while Codex is still
 * copying the parent block, before that copy reaches the parent snapshot's
 * end. In that state the exact records are inherited history even though the
 * stricter completed-replay suffix match above deliberately rejects them.
 */
function longestPartialReplayPrefix(child, parent) {
  if (child.length === 0 || parent.length === 0) return 0;

  const prefix = new Array(child.length).fill(0);
  for (let i = 1, matched = 0; i < child.length; i++) {
    while (matched > 0 && child[i] !== child[matched]) matched = prefix[matched - 1];
    if (child[i] === child[matched]) matched++;
    prefix[i] = matched;
  }

  let matched = 0;
  let longest = 0;
  for (const fingerprint of parent) {
    while (matched > 0 && fingerprint !== child[matched]) matched = prefix[matched - 1];
    if (fingerprint === child[matched]) matched++;
    longest = Math.max(longest, matched);
    if (matched === child.length) matched = prefix[matched - 1];
  }
  return longest;
}

// `task_started.started_at` is stored at one-second precision while the
// canonical session timestamp has milliseconds. Real Codex Desktop rollouts
// start the child task within a few seconds of creating the child session.
const OWN_TASK_START_WINDOW_MS = 5_000;

/**
 * Stream a rollout once and build a compact replay index. A fork/sub-agent
 * file starts with its own session_meta and can then contain the source
 * session's complete metadata and history. Only the first session_meta is
 * canonical; later ones are replayed records and must never overwrite it.
 *
 * tokenTimes preserves raw token_count ordinals (including malformed usage
 * records) on a monotonic timeline. tokenFingerprints identifies an exact
 * copied sequence even when Codex forks only the last N turns instead of a
 * full prefix. Together they bound matching to source records that existed at
 * spawn without over-skipping child work when the parent later grows.
 */
async function indexSessionFile(filePath, snapshotSize) {
  let sessionId = null;
  let forkedFromId = null;
  let parentThreadId = null;
  let sessionProject = 'unknown';
  let sessionStartedAtMs = null;
  let isSubagent = false;
  let sessionMetaCount = 0;
  let parsedRecordCount = 0;
  let rawTokenCount = 0;
  let logicalTimestamp = Number.NEGATIVE_INFINITY;
  const tokenTimes = [];
  const tokenFingerprints = [];
  let pendingTokenTimeIndexes = [];
  const taskBoundaries = [];
  let firstTaskBoundary = null;
  let ownTaskBoundary = null;

  for await (const line of readLines(filePath, snapshotSize)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      parsedRecordCount++;

      const recordTimestamp = timestampMs(obj.timestamp);
      if (recordTimestamp != null) {
        logicalTimestamp = Math.max(logicalTimestamp, recordTimestamp);
        // An invalid token_count timestamp is placed at the next valid record
        // time. If there is no next valid record it remains +Infinity, which
        // deliberately biases a parent-at-spawn boundary toward under-skip.
        for (const idx of pendingTokenTimeIndexes) tokenTimes[idx] = logicalTimestamp;
        pendingTokenTimeIndexes = [];
      }

      if (obj.type === 'session_meta' && obj.payload) {
        sessionMetaCount++;
        if (sessionMetaCount === 1) {
          const meta = obj.payload;
          sessionId = meta.id || null;
          forkedFromId = meta.forked_from_id || null;
          parentThreadId = extractParentThreadId(meta);
          isSubagent = isSubagentMeta(meta);
          sessionProject = extractProject(meta);
          sessionStartedAtMs = timestampMs(meta.timestamp) ?? recordTimestamp;
        }
      } else if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
        rawTokenCount++;
        tokenFingerprints.push(tokenFingerprint(obj.payload));
        if (recordTimestamp == null) {
          tokenTimes.push(Number.POSITIVE_INFINITY);
          pendingTokenTimeIndexes.push(tokenTimes.length - 1);
        } else {
          tokenTimes.push(logicalTimestamp);
        }
      } else if (obj.type === 'event_msg' && isTaskStarted(obj.payload)) {
        const boundary = {
          recordIndex: parsedRecordCount,
          rawTokenCount,
          startedAtMs: epochMs(obj.payload.started_at),
        };
        taskBoundaries.push(boundary);
        firstTaskBoundary ??= boundary;

        const startedAtMs = boundary.startedAtMs;
        if (sessionStartedAtMs != null && startedAtMs != null
            && Math.abs(startedAtMs - sessionStartedAtMs) <= OWN_TASK_START_WINDOW_MS) {
          // Keep the last match so a copied parent task that happened to start
          // in the same second cannot win over the child's later own boundary.
          ownTaskBoundary = boundary;
        }
      }
    } catch {
      continue;
    }
  }

  return {
    filePath,
    sessionId,
    forkedFromId,
    parentThreadId,
    sessionProject,
    sessionStartedAtMs,
    isSubagent,
    sessionMetaCount,
    parsedRecordCount,
    rawTokenCount,
    tokenTimes,
    tokenFingerprints,
    taskBoundaries,
    firstTaskBoundary,
    ownTaskBoundary,
  };
}

function replayBoundary(meta, sessionById) {
  const parentId = meta.forkedFromId || (meta.isSubagent ? meta.parentThreadId : null);
  const parent = parentId ? sessionById.get(parentId) : null;
  const parentAtSpawn = parent && meta.sessionStartedAtMs != null
    ? upperBound(parent.tokenTimes, meta.sessionStartedAtMs)
    : null;
  const parentSnapshot = parentAtSpawn == null
    ? []
    : parent.tokenFingerprints.slice(0, parentAtSpawn);
  const replayTokenCount = longestReplayPrefix(meta.tokenFingerprints, parentSnapshot);
  const partialReplayTokenCount = meta.isSubagent
    ? longestPartialReplayPrefix(meta.tokenFingerprints, parentSnapshot)
    : 0;

  if (meta.isSubagent) {
    // Direct evidence inside the child wins. Legacy single-meta rollouts did
    // not replay task_started records, so their first task remains a safe
    // fallback. Double-meta files must not use their copied parent's first
    // task_started as the boundary.
    // Exact token matching also handles LastNTurns forks. When it identifies
    // the copied token suffix, the last task_started at that same raw ordinal
    // is the child's own task boundary (copied history is written first).
    const matchedTaskBoundaries = replayTokenCount > 0
      ? meta.taskBoundaries.filter(boundary => (
        boundary.rawTokenCount === replayTokenCount
        && boundary.startedAtMs != null
        && meta.sessionStartedAtMs != null
        && boundary.startedAtMs >= Math.floor(meta.sessionStartedAtMs / 1000) * 1000
      ))
      : [];
    const matchedTaskBoundary = matchedTaskBoundaries.at(-1) || null;
    const direct = matchedTaskBoundary
      || meta.ownTaskBoundary
      || (meta.sessionMetaCount === 1 && !meta.forkedFromId
        ? meta.firstTaskBoundary
        : null);
    if (direct) {
      return {
        rawTokenCount: Math.max(
          replayTokenCount,
          partialReplayTokenCount,
          direct.rawTokenCount
        ),
        recordIndex: direct.recordIndex,
      };
    }

    // A recognized sub-agent can be synced while Codex is only partway
    // through appending the copied parent block. The completed-replay matcher
    // correctly rejects that interior slice, but counting it would create a
    // temporary spike that disappears on the next sync. Exact payload overlap
    // with the known parent is sufficient evidence to defer those leading
    // records until the rollout reaches a stable suffix or task boundary.
    return {
      rawTokenCount: Math.max(replayTokenCount, partialReplayTokenCount),
      recordIndex: null,
    };
  }

  if (meta.forkedFromId) {
    return { rawTokenCount: replayTokenCount, recordIndex: null };
  }
  return { rawTokenCount: 0, recordIndex: null };
}

function boundaryKey(boundary) {
  return `${boundary.rawTokenCount}:${boundary.recordIndex ?? ''}`;
}

function updateFileCache(codexHome, file, changes) {
  const data = cacheData(file.cache, changes);
  try {
    saveCodexFileCache(codexHome, file.filePath, file.signature, data);
  } catch {
    // A read-only home, full disk, or antivirus race must only disable the
    // optimization for this run. Raw-log parsing remains the source of truth.
  }
  file.cache = { ...(file.cache || {}), ...data };
}

function workBudgetMs() {
  const configured = Number(process.env.CODEX_QQ_SKIN_CODEX_WORK_BUDGET_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  // The macOS app terminates its child after 120 seconds. Cache-building work
  // in a non-interactive child therefore checkpoints before that wall so the
  // next invocation resumes instead of starting from zero. Interactive users
  // can let a cold build finish in one run (and can interrupt it safely).
  if (codexCacheEnabled() && !process.stdout.isTTY) return 105_000;
  return Number.POSITIVE_INFINITY;
}

function auditIntervalMs() {
  const configured = Number(process.env.CODEX_QQ_SKIN_CODEX_AUDIT_INTERVAL_MS);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return 30 * 24 * 60 * 60 * 1000;
}

function auditMaxBytes() {
  const configured = Number(process.env.CODEX_QQ_SKIN_CODEX_AUDIT_MAX_BYTES);
  if (Number.isFinite(configured) && configured > 0) return configured;
  // Keep the background audit bounded below the app's wall timeout. Larger
  // active files are still invalidated immediately by their stat signature,
  // and every cache generation is rebuilt after parser-algorithm changes.
  return 64 * 1024 * 1024;
}

function applySessionEvent(acc, event) {
  const timestampMsValue = event.timestamp.getTime();
  if (acc.lastTimestampMs != null && timestampMsValue < acc.lastTimestampMs) return false;
  acc.firstTimestampMs ??= timestampMsValue;
  acc.lastTimestampMs = timestampMsValue;
  acc.messageCount++;

  if (event.role === 'user') {
    if (acc.turnStartMs != null && acc.turnEndMs != null && acc.turnEndMs > acc.turnStartMs) {
      acc.completedActiveSeconds += Math.round((acc.turnEndMs - acc.turnStartMs) / 1000);
    }
    acc.turnStartMs = null;
    acc.turnEndMs = null;
    acc.waitingForFirstResponse = true;
    acc.userMessageCount++;
    acc.userPromptHours[event.timestamp.getUTCHours()]++;
  } else if (acc.waitingForFirstResponse) {
    acc.turnStartMs = timestampMsValue;
    acc.turnEndMs = timestampMsValue;
    acc.waitingForFirstResponse = false;
  } else if (acc.turnStartMs != null) {
    acc.turnEndMs = timestampMsValue;
  }
  return true;
}

function buildSessionAccumulator(events, previous = null) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0];
  const acc = previous
    ? {
        ...previous,
        userPromptHours: [...previous.userPromptHours],
      }
    : {
        sessionId: first?.sessionId || null,
        source: first?.source || null,
        project: first?.project || 'unknown',
        firstTimestampMs: null,
        lastTimestampMs: null,
        completedActiveSeconds: 0,
        turnStartMs: null,
        turnEndMs: null,
        waitingForFirstResponse: false,
        messageCount: 0,
        userMessageCount: 0,
        userPromptHours: new Array(24).fill(0),
      };
  for (const event of sorted) {
    if (!applySessionEvent(acc, event)) return null;
  }
  return acc.sessionId ? acc : null;
}

function sessionFromAccumulator(acc) {
  if (!acc?.sessionId || acc.firstTimestampMs == null || acc.lastTimestampMs == null) return null;
  let activeSeconds = acc.completedActiveSeconds;
  if (acc.turnStartMs != null && acc.turnEndMs != null && acc.turnEndMs > acc.turnStartMs) {
    activeSeconds += Math.round((acc.turnEndMs - acc.turnStartMs) / 1000);
  }
  return {
    source: acc.source,
    project: acc.project || 'unknown',
    sessionHash: createHash('sha256').update(acc.sessionId).digest('hex').slice(0, 16),
    firstMessageAt: new Date(acc.firstTimestampMs).toISOString(),
    lastMessageAt: new Date(acc.lastTimestampMs).toISOString(),
    durationSeconds: Math.round((acc.lastTimestampMs - acc.firstTimestampMs) / 1000),
    activeSeconds,
    messageCount: acc.messageCount,
    userMessageCount: acc.userMessageCount,
    userPromptHours: acc.userPromptHours,
  };
}

function mergeBucketLists(lists) {
  const entries = [];
  for (const buckets of lists) {
    for (const bucket of buckets || []) {
      entries.push({
        source: bucket.source,
        model: bucket.model,
        project: bucket.project,
        ...(bucket.hostname ? { hostname: bucket.hostname } : {}),
        timestamp: new Date(bucket.bucketStart),
        inputTokens: bucket.inputTokens,
        outputTokens: bucket.outputTokens,
        cachedInputTokens: bucket.cachedInputTokens,
        reasoningOutputTokens: bucket.reasoningOutputTokens,
      });
    }
  }
  return aggregateToBuckets(entries);
}

async function parseSessionFile(filePath, snapshotSize, fm, boundary, {
  previousTail = null,
  captureTail = false,
} = {}) {
  const entries = [];
  const sessionEvents = [];
  let rawTokenSeen = previousTail?.rawTokenSeen || 0;
  let parsedRecordIndex = previousTail?.parsedRecordIndex || 0;
  let firstSessionMetaSeen = previousTail?.firstSessionMetaSeen || false;

  const sessionProject = fm.sessionProject;
  // Group timing events by the real Codex session id, not the file path: the
  // same session can briefly exist in both sessions/ and archived_sessions/
  // (mid-archive, or a re-synced archive). Path-keyed grouping would emit it
  // as two different sessionHashes and double-count its session stats. Fall
  // back to the path only when the id is unknown (corrupt/missing meta).
  const sessionKey = fm.sessionId || filePath;

  let turnContextModel = previousTail?.turnContextModel || 'unknown';
  let prevTotal = previousTail?.prevTotal || null;
  let prevCumulativeTotal = previousTail?.prevCumulativeTotal ?? null;
  const start = previousTail?.parsedBytes || 0;
  for await (const line of readLines(filePath, snapshotSize, start)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      parsedRecordIndex++;

        // A direct child task boundary covers every copied record, including
        // timing/meta events. The raw-token ordinal covers full-history and
        // last-N-turn forks whose exact payload sequence was matched in pass 1.
      const beforeOwnTask = boundary.recordIndex != null
        && parsedRecordIndex < boundary.recordIndex;
      const inReplayBlock = beforeOwnTask || rawTokenSeen < boundary.rawTokenCount;

      const isSessionMeta = obj.type === 'session_meta';
      const isCanonicalSessionMeta = isSessionMeta && !firstSessionMetaSeen;
      const isOwnSessionMeta = isSessionMeta
        && obj.payload?.id != null
        && obj.payload.id === fm.sessionId;
      if (isSessionMeta) firstSessionMetaSeen = true;

      if (obj.timestamp) {
        const evTs = new Date(obj.timestamp);
        if (!isNaN(evTs.getTime())) {
            // Repeated same-id metadata can be appended on resume/config
            // updates and belongs to this logical session. A different-id meta
            // is copied parent history and must not inflate timing stats.
          const keepSessionMeta = isCanonicalSessionMeta
            || (isOwnSessionMeta && !inReplayBlock);
          if (keepSessionMeta || (!isSessionMeta && !inReplayBlock)) {
            const isUserTurn = obj.type === 'turn_context' || obj.type === 'session_meta';
            sessionEvents.push({
              sessionId: sessionKey,
              source: 'codex',
              project: sessionProject,
              timestamp: evTs,
              role: isUserTurn ? 'user' : 'assistant',
            });
          }
        }
      }

      if (obj.type === 'turn_context' && obj.payload?.model) {
        turnContextModel = obj.payload.model;
        continue;
      }

      if (obj.type !== 'event_msg') continue;

      const payload = obj.payload;
      if (!payload) continue;

      if (payload.type !== 'token_count') continue;

        // Raw ordinals advance before validating usage/timestamp so pass 1 and
        // pass 2 cannot drift on a malformed copied token_count record.
      const isReplayedHistory = inReplayBlock;
      rawTokenSeen++;

      const info = payload.info;
      if (!info) continue;

        // Codex sometimes writes the same token_count twice back-to-back:
        // identical last_token_usage with an unchanged cumulative total. A
        // real API call always advances the cumulative counter (its input
        // tokens alone are non-zero), so an unchanged positive total marks a
        // duplicate emission — or a zero-usage bookkeeping event such as
        // compaction — and must count as zero, not a second copy of
        // last_token_usage. Guarded to positive totals so builds that leave
        // total_token_usage all-zero can't suppress real usage.
      const cumulativeTotal = info.total_token_usage?.total_tokens;
      const isDuplicateEmission = typeof cumulativeTotal === 'number'
        && cumulativeTotal > 0
        && cumulativeTotal === prevCumulativeTotal;
      if (typeof cumulativeTotal === 'number') prevCumulativeTotal = cumulativeTotal;

        // Prefer incremental per-request usage; compute delta from cumulative
        // totals as fallback. Always advance the cumulative baseline, even
        // when last_token_usage exists or the record belongs to a replay.
      const curr = info.total_token_usage;
      let usage = info.last_token_usage;
      if (!usage && curr) {
        if (prevTotal) {
          const delta = {
            input_tokens: (curr.input_tokens || 0) - (prevTotal.input_tokens || 0),
            output_tokens: (curr.output_tokens || 0) - (prevTotal.output_tokens || 0),
            cached_input_tokens: (curr.cached_input_tokens || 0) - (prevTotal.cached_input_tokens || 0),
            reasoning_output_tokens: (curr.reasoning_output_tokens || 0) - (prevTotal.reasoning_output_tokens || 0),
          };
            // Cumulative counters can reset after compaction or a new usage
            // window. Treat the first post-reset total as a fresh baseline;
            // allowing a negative delta would cancel legitimate bucket usage.
          usage = Object.values(delta).some(value => value < 0) ? curr : delta;
        } else {
            // First cumulative entry — use as-is (it's the first event's total)
          usage = curr;
        }
      }
        // total_token_usage is session-wide, not per model. A global baseline
        // avoids counting the full cumulative total again after a model switch.
      if (curr) prevTotal = { ...curr };
      if (!usage) continue;
      if (isReplayedHistory || isDuplicateEmission) continue;

      const timestamp = obj.timestamp ? new Date(obj.timestamp) : null;
      if (!timestamp || isNaN(timestamp.getTime())) continue;

      const model = info.model || payload.model || turnContextModel || 'unknown';

        // OpenAI API: input_tokens INCLUDES cached, output_tokens INCLUDES reasoning.
        // Normalize to Anthropic-style semantics where each field is non-overlapping.
      const cachedInput = usage.cached_input_tokens || usage.cache_read_input_tokens || 0;
      const reasoningOutput = usage.reasoning_output_tokens || 0;
      entries.push({
        source: 'codex',
        model,
        project: sessionProject,
        timestamp,
        inputTokens: (usage.input_tokens || 0) - cachedInput,
        outputTokens: (usage.output_tokens || 0) - reasoningOutput,
        cachedInputTokens: cachedInput,
        reasoningOutputTokens: reasoningOutput,
      });
    } catch {
      continue;
    }
  }

  // Indexed files must match both passes exactly. Ordinary sessions take the
  // single-pass fast path and have no expected counts; their byte-bounded
  // snapshot is still stable, and any append invalidates the stat signature on
  // the next sync.
  if (fm.parsedRecordCount != null && fm.rawTokenCount != null) {
    if (parsedRecordIndex !== fm.parsedRecordCount || rawTokenSeen !== fm.rawTokenCount) {
      throw new Error('Codex rollout changed while syncing; retry on the next sync');
    }
  }

  const buckets = mergeBucketLists([
    previousTail?.buckets || [],
    aggregateToBuckets(entries),
  ]);
  const sessionAccumulator = buildSessionAccumulator(
    sessionEvents,
    previousTail?.sessionAccumulator || null
  );
  // Appended records should be chronological. If an app version inserts an
  // older event into the tail, the compact accumulator cannot reproduce the
  // global sort exactly, so discard the optimization and rebuild this file.
  if (previousTail && sessionEvents.length > 0 && !sessionAccumulator) {
    return parseSessionFile(filePath, snapshotSize, fm, boundary, { captureTail });
  }
  const session = sessionFromAccumulator(sessionAccumulator);
  const result = { buckets, sessions: session ? [session] : [] };
  if (captureTail) {
    const guard = snapshotGuard(filePath, snapshotSize);
    result.tail = {
      parsedBytes: snapshotSize,
      parsedRecordIndex,
      rawTokenSeen,
      firstSessionMetaSeen,
      turnContextModel,
      prevTotal,
      prevCumulativeTotal,
      buckets,
      sessionAccumulator,
      guardHash: guard.hash,
      endsWithNewline: guard.endsWithNewline,
    };
  }
  return result;
}

function mergeFileResults(results) {
  const entries = [];
  const sessions = [];
  for (const result of results) {
    for (const bucket of result.buckets || []) {
      entries.push({
        source: bucket.source,
        model: bucket.model,
        project: bucket.project,
        ...(bucket.hostname ? { hostname: bucket.hostname } : {}),
        timestamp: new Date(bucket.bucketStart),
        inputTokens: bucket.inputTokens,
        outputTokens: bucket.outputTokens,
        cachedInputTokens: bucket.cachedInputTokens,
        reasoningOutputTokens: bucket.reasoningOutputTokens,
      });
    }
    sessions.push(...(result.sessions || []));
  }
  return { buckets: aggregateToBuckets(entries), sessions };
}

export async function parse() {
  const codexHome = getCodexHome();
  const dirs = sessionsDirs(codexHome);
  if (!dirs.some(existsSync)) return { buckets: [], sessions: [] };

  const startedAt = Date.now();
  const budget = workBudgetMs();
  const overBudget = () => Date.now() - startedAt >= budget;
  const cacheStats = {
    headerHits: 0,
    indexHits: 0,
    resultHits: 0,
    tailHits: 0,
    filesRead: 0,
    audited: 0,
  };
  const files = [];
  for (const filePath of dirs.flatMap(findJsonlFiles)) {
    try {
      const stat = statSync(filePath);
      if (stat.size <= 0) continue;
      const signature = fileSignature(stat);
      const cache = loadCodexFileCache(codexHome, filePath, signature);
      const priorCache = cache || loadCodexFileCache(codexHome, filePath);
      const priorTail = cache ? null : loadCodexFileTail(codexHome, filePath);
      const file = {
        filePath,
        snapshotSize: stat.size,
        signature,
        cache,
        priorCache,
        priorTail,
        header: null,
        appendTail: null,
      };
      if (!cache && priorCache) file.appendTail = tailStateFor(file);
      files.push(file);
    } catch {
      // The file may move to archived_sessions between discovery and stat.
      // Its archived copy will be picked up on the next sync.
    }
  }
  if (files.length === 0) return { buckets: [], sessions: [] };

  // A warm cache gets a tiny rolling correctness audit. Never mix this into a
  // cold/resumed build: all files must already have complete results, and at
  // most one bounded file is re-read per invocation.
  const auditPaths = new Set();
  if (files.every(file => file.cache?.header && file.cache?.result)) {
    const cutoff = Date.now() - auditIntervalMs();
    const candidate = files
      .filter(file => file.snapshotSize <= auditMaxBytes())
      .filter(file => (file.cache.lastAuditedAt || 0) <= cutoff)
      .sort((a, b) => (a.cache.lastAuditedAt || 0) - (b.cache.lastAuditedAt || 0))[0];
    if (candidate) auditPaths.add(candidate.filePath);
  }

  // Cheap discovery: cached headers require no rollout read. On a cold build,
  // read only through the first session_meta so ordinary sessions can avoid
  // the former all-files replay-index pass.
  const candidatesById = new Map();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const reusableHeader = file.cache?.header || (file.appendTail ? file.priorCache?.header : null);
    if (reusableHeader && !auditPaths.has(file.filePath)) {
      file.header = reusableHeader;
      if (!file.cache) file.cache = { header: reusableHeader };
      cacheStats.headerHits++;
    } else {
      try {
        file.header = await readSessionHeader(file.filePath, file.snapshotSize);
        cacheStats.filesRead++;
        updateFileCache(codexHome, file, { header: file.header });
      } catch {
        continue;
      }
    }
    if (file.header.sessionId) {
      if (!candidatesById.has(file.header.sessionId)) candidatesById.set(file.header.sessionId, []);
      candidatesById.get(file.header.sessionId).push(file);
    }
    if (overBudget() && i < files.length - 1) {
      return {
        buckets: [], sessions: [], skipped: true,
        indexing: { phase: 'discovery', completed: i + 1, total: files.length },
        cache: cacheStats,
      };
    }
  }

  const duplicateIds = new Set(
    [...candidatesById].filter(([, candidates]) => candidates.length > 1).map(([id]) => id)
  );
  const referencedParentIds = new Set();
  for (const file of files) {
    const parentId = file.header?.forkedFromId
      || (file.header?.isSubagent ? file.header.parentThreadId : null);
    if (parentId) referencedParentIds.add(parentId);
  }

  // Only replay participants, their parents, corrupt-header files, and
  // duplicate physical copies need the full compact token index.
  const fileMeta = new Map();
  const needsIndex = new Set();
  for (const file of files) {
    const header = file.header;
    const required = !header
      || !header.sessionId
      || header.isSubagent
      || header.forkedFromId != null
      || header.parentThreadId != null
      || referencedParentIds.has(header.sessionId)
      || duplicateIds.has(header.sessionId);
    if (!required) {
      fileMeta.set(file.filePath, { ...header, filePath: file.filePath });
      continue;
    }
    needsIndex.add(file.filePath);
    let meta = auditPaths.has(file.filePath) ? null : file.cache?.index;
    if (meta) {
      cacheStats.indexHits++;
    } else {
      try {
        meta = await indexSessionFile(file.filePath, file.snapshotSize);
        cacheStats.filesRead++;
        updateFileCache(codexHome, file, { index: meta });
      } catch {
        continue;
      }
    }
    fileMeta.set(file.filePath, meta);
    if (overBudget()) {
      return {
        buckets: [], sessions: [], skipped: true,
        indexing: { phase: 'replay-index', completed: fileMeta.size, total: files.length },
        cache: cacheStats,
      };
    }
  }

  // Select the most complete physical copy exactly as before. Unique ordinary
  // sessions have no full record count, but cannot compete with another copy.
  const sessionById = new Map();
  for (const file of files) {
    const meta = fileMeta.get(file.filePath);
    if (!meta?.sessionId) continue;
    const existing = sessionById.get(meta.sessionId);
    const count = meta.parsedRecordCount ?? 0;
    const existingCount = existing?.parsedRecordCount ?? 0;
    if (!existing || count > existingCount) sessionById.set(meta.sessionId, meta);
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fm = fileMeta.get(file.filePath);
    if (!fm) continue;
    if (fm.sessionId && sessionById.get(fm.sessionId)?.filePath !== file.filePath) continue;

    const boundary = needsIndex.has(file.filePath)
      ? replayBoundary(fm, sessionById)
      : { rawTokenCount: 0, recordIndex: null };
    const key = boundaryKey(boundary);
    let result = !auditPaths.has(file.filePath) && file.cache?.result?.boundaryKey === key
      ? file.cache.result
      : null;
    if (result) {
      cacheStats.resultHits++;
    } else {
      const previousTail = !needsIndex.has(file.filePath) && !auditPaths.has(file.filePath)
        ? file.appendTail
        : null;
      const parsed = await parseSessionFile(file.filePath, file.snapshotSize, fm, boundary, {
        previousTail,
        captureTail: !needsIndex.has(file.filePath),
      });
      cacheStats.filesRead++;
      if (previousTail) cacheStats.tailHits++;
      const { tail, ...summary } = parsed;
      if (tail) {
        try {
          saveCodexFileTail(codexHome, file.filePath, file.signature, tail);
        } catch {
          // Same fail-open rule as the summary cache: tail acceleration is
          // optional and a write failure must not fail the parser.
        }
      }
      result = { boundaryKey: key, ...summary };
      updateFileCache(codexHome, file, { result, lastAuditedAt: Date.now() });
      file.appendTail = null;
      file.priorTail = null;
      if (auditPaths.has(file.filePath)) cacheStats.audited++;
    }
    results.push(result);

    if (overBudget() && i < files.length - 1) {
      return {
        buckets: [], sessions: [], skipped: true,
        indexing: { phase: 'usage', completed: i + 1, total: files.length },
        cache: cacheStats,
      };
    }
  }

  return { ...mergeFileResults(results), cache: cacheStats };
}
