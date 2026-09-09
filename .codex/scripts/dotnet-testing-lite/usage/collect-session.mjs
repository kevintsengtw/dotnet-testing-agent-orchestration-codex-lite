import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const counters = ['total_tokens', 'input_tokens', 'cached_input_tokens',
  'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'];

function usageFields(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(counters.filter(k => Object.hasOwn(value, k)).map(k => {
    if (!Number.isSafeInteger(value[k]) || value[k] < 0) throw new Error(`Invalid usage counter: ${k}`);
    return [k, value[k]];
  }));
}

export function extractSession(text, expectedId, { allowIncompleteTail = false } = {}) {
  if (!uuid.test(expectedId)) throw new Error('Invalid exact thread ID');
  const events = [];
  const types = new Set();
  let metadata = null;
  let incompleteTail = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let record;
    try { record = JSON.parse(lines[i]); }
    catch {
      if (allowIncompleteTail && i === lines.length - 1 && !text.endsWith('\n')) {
        incompleteTail = true;
        break;
      }
      throw new Error(`Invalid JSON at line ${i + 1}; refuse incomplete capture`);
    }
    const p = record.payload ?? {};
    types.add(record.type === 'event_msg' ? `event_msg:${p.type}` : record.type);
    if (record.type === 'session_meta') {
      if (metadata || p.id !== expectedId) throw new Error('Session identity mismatch or duplicate metadata');
      // Deliberately exclude instructions, titles, cwd, credentials and conversation text.
      metadata = { id: p.id, cliVersion: p.cli_version ?? null,
        source: typeof p.source === 'string' ? p.source : null,
        forkedFromId: p.forked_from_id ?? null,
        parentThreadId: p.source?.subagent?.thread_spawn?.parent_thread_id ?? null,
        agentPath: p.source?.subagent?.thread_spawn?.agent_path ?? null };
    }
    if (record.type === 'turn_context') {
      events.push({ line: i + 1, type: 'turn_context', turnId: p.turn_id ?? null,
        model: p.model ?? null, effort: p.effort ?? null, serviceTier: p.service_tier ?? null });
    }
    if (record.type === 'token_usage_record') {
      events.push({ line: i + 1, timestamp: record.timestamp ?? null, type: record.type,
        threadId: p.thread_id ?? null, turnId: p.turn_id ?? null, sessionId: p.session_id ?? null,
        rootTurnId: p.root_turn_id ?? null, responseId: p.response_id ?? null,
        usage: usageFields(p.usage), turnUsage: usageFields(p.turn_token_usage),
        threadUsage: usageFields(p.thread_token_usage) });
    }
    if (record.type === 'compacted') {
      events.push({ line: i + 1, timestamp: record.timestamp ?? null, type: 'compacted' });
    }
    if (record.type !== 'event_msg') continue;
    const base = { line: i + 1, timestamp: record.timestamp ?? null, type: p.type };
    if (p.type === 'token_count') {
      events.push({ ...base, total: usageFields(p.info?.total_token_usage),
        last: usageFields(p.info?.last_token_usage), modelContextWindow: p.info?.model_context_window ?? null });
    } else if (['task_started', 'task_complete', 'turn_aborted'].includes(p.type)) {
      events.push({ ...base, turnId: p.turn_id ?? null });
    }
  }
  if (!metadata) throw new Error('Missing session metadata');
  return { metadata, observedRecordTypes: [...types].sort(), events, incompleteTail,
    observedLifecycle: lifecycle(events) };
}

export function lifecycle(events) {
  const start = events.filter(e => e.type === 'task_started').at(-1);
  if (!start) return 'unknown';
  const after = events.filter(e => e.line > start.line);
  if (after.some(e => e.type === 'turn_aborted' && (!e.turnId || e.turnId === start.turnId))) return 'interrupted';
  if (after.some(e => e.type === 'task_complete' && e.turnId === start.turnId)) return 'completed_observed';
  return 'in_progress_observed';
}

export function compareTerminal(total, terminal) {
  if (!total || !terminal) return null;
  const pairs = [['total_tokens', 'total'], ['input_tokens', 'input'],
    ['cached_input_tokens', 'cached'], ['output_tokens', 'output']];
  return Object.fromEntries(pairs.map(([raw, summary]) => [raw,
    Number.isSafeInteger(total[raw]) && Number.isSafeInteger(terminal[summary])
      ? total[raw] === terminal[summary] : null]));
}

export function compareUncachedTerminal(total, terminal) {
  if (!total || !terminal) return null;
  const required = [total.input_tokens, total.cached_input_tokens, total.output_tokens,
    terminal.input, terminal.cached, terminal.output, terminal.total];
  if (!required.every(Number.isSafeInteger)) return null;
  return {
    hypothesis: 'terminal input excludes cached input; terminal total uses that input',
    inputMatches: terminal.input === total.input_tokens - total.cached_input_tokens,
    cachedMatches: terminal.cached === total.cached_input_tokens,
    outputMatches: terminal.output === total.output_tokens,
    totalMatches: terminal.total === total.input_tokens - total.cached_input_tokens + total.output_tokens,
  };
}

function exactFiles(root, id) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return exactFiles(file, id);
    return entry.isFile() && entry.name.endsWith(`-${id}.jsonl`) ? [file] : [];
  });
}

export function collect({ sessionsRoot, threadId, output, terminal, throughTurnId }) {
  if (!uuid.test(threadId)) throw new Error('Exact UUID required; never infer latest session');
  const files = exactFiles(sessionsRoot, threadId);
  if (files.length !== 1) throw new Error(`Expected exactly one matching session file; found ${files.length}`);
  const bytes = fs.readFileSync(files[0]);
  const capture = extractSession(bytes.toString('utf8'), threadId, { allowIncompleteTail: true });
  if (throughTurnId) {
    const boundary = capture.events.find(e => e.type === 'task_complete' && e.turnId === throughTurnId);
    if (!boundary) throw new Error('Requested historical completion boundary missing');
    capture.events = capture.events.filter(e => e.line <= boundary.line);
    capture.observedLifecycle = lifecycle(capture.events);
  }
  const totals = capture.events.filter(e => e.type === 'token_count' && e.total);
  const observed = totals.at(-1)?.total ?? null;
  const requestThreadTotal = capture.events.filter(e => e.type === 'token_usage_record').at(-1)?.threadUsage ?? null;
  const report = {
    schemaVersion: 1, capturedAt: new Date().toISOString(), source: 'codex-session-log',
    measurement: 'runtime-reported', phase: 'snapshot', completeness: 'partial',
    aggregationPolicy: 'unverified', usage: null,
    throughTurnId: throughTurnId ?? null,
    sourceFile: path.basename(files[0]), sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    ...capture, observedThreadTotal: observed, terminalSummary: terminal ?? null,
    observedTokenCountTotal: observed, observedRequestThreadTotal: requestThreadTotal,
    terminalComparison: compareTerminal(observed, terminal),
    uncachedTerminalComparison: compareUncachedTerminal(observed, terminal),
    limitations: [...(capture.incompleteTail ? ['Incomplete final JSON line excluded; retry required'] : []),
      'Internal version-specific session format', 'Parent/child accounting unverified',
      'Last observed counter is not proof that all final usage has settled'],
  };
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [sessionsRoot, threadId, output, terminalJson] = process.argv.slice(2);
    if (!sessionsRoot || !threadId || !output) throw new Error('Usage: node collect-session.mjs <sessions-root> <exact-thread-id> <new-output.json> [terminal-json]');
    const report = collect({ sessionsRoot, threadId, output,
      terminal: terminalJson ? JSON.parse(terminalJson) : undefined });
    console.log(JSON.stringify({ output, metadata: report.metadata,
      observedThreadTotal: report.observedThreadTotal, terminalComparison: report.terminalComparison,
      eventCount: report.events.length, observedRecordTypes: report.observedRecordTypes }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
