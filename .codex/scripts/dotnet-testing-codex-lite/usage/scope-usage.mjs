import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
  'output_tokens', 'reasoning_output_tokens', 'total_tokens'];

// Workflow scope: explicit root-turn membership, never a session-counter subtraction.
export function summarizeScope(scope, relations, captures) {
  if (!scope.workflowId || !scope.rootThreadId || !scope.rootTurnIds?.length ||
      scope.rootTurnIds.some(id => typeof id !== 'string' || !id)) throw new Error('Explicit scope required');
  if (relations.rootThreadId !== scope.rootThreadId) throw new Error('Root relation mismatch');
  const turns = new Set(scope.rootTurnIds);
  const parents = new Map();
  for (const edge of relations.edges) {
    if (parents.has(edge.childThreadId)) throw new Error('Duplicate child relationship');
    parents.set(edge.childThreadId, edge.parentThreadId);
  }
  const belongs = id => {
    const seen = new Set();
    while (id !== scope.rootThreadId) {
      if (seen.has(id)) throw new Error('Cyclic relationship');
      seen.add(id);
      if (!parents.has(id)) return false;
      id = parents.get(id);
    }
    return true;
  };
  for (const id of parents.keys()) if (!belongs(id)) throw new Error('Disconnected relationship');
  const threads = new Map();
  const requests = new Map();
  const excluded = [];
  const unresolved = [];
  for (const c of captures) {
    const id = c.metadata.id;
    if (threads.has(id) || !belongs(id)) throw new Error('Duplicate or unrelated capture');
    if (id !== scope.rootThreadId && c.metadata.parentThreadId !== parents.get(id)) throw new Error('Parent metadata mismatch');
    threads.set(id, c);
    for (const r of c.events.filter(e => e.type === 'token_usage_record')) {
      if (r.threadId !== id || !r.responseId || !r.turnId) throw new Error('Request identity missing or conflicting');
      const value = { threadId: id, turnId: r.turnId, rootTurnId: r.rootTurnId, responseId: r.responseId, usage: r.usage };
      const old = requests.get(r.responseId);
      if (old && JSON.stringify(old) !== JSON.stringify(value)) throw new Error('Conflicting response identity');
      requests.set(r.responseId, value);
    }
  }
  if (!threads.has(scope.rootThreadId)) throw new Error('Root capture missing');
  const selected = [];
  for (const r of requests.values()) {
    for (const k of fields) if (Object.hasOwn(r.usage ?? {}, k) &&
      (!Number.isSafeInteger(r.usage[k]) || r.usage[k] < 0)) throw new Error('Invalid usage');
    if (!r.rootTurnId) { unresolved.push(r.responseId); continue; }
    if (r.threadId === scope.rootThreadId && r.rootTurnId !== r.turnId) {
      unresolved.push(r.responseId); continue;
    }
    (turns.has(r.rootTurnId) ? selected : excluded).push(r);
  }
  const turnPairs = new Map(scope.rootTurnIds.map(id => [`${scope.rootThreadId}:${id}`, [scope.rootThreadId, id]]));
  for (const r of selected) turnPairs.set(`${r.threadId}:${r.turnId}`, [r.threadId, r.turnId]);
  const completion = [...turnPairs.values()].map(([threadId, turnId]) => {
    const events = threads.get(threadId)?.events ?? [];
    return { threadId, turnId,
      started: events.some(e => e.type === 'task_started' && e.turnId === turnId),
      completed: events.some(e => e.type === 'task_complete' && e.turnId === turnId),
      interrupted: events.some(e => e.type === 'turn_aborted' && e.turnId === turnId) };
  });
  const observedTotals = Object.fromEntries(fields.map(k => {
    const sum = selected.length && selected.every(r => Number.isSafeInteger(r.usage?.[k]))
      ? selected.reduce((n, r) => n + r.usage[k], 0) : null;
    if (sum !== null && !Number.isSafeInteger(sum)) throw new Error('Usage sum overflow');
    return [k, sum];
  }));
  return { schemaVersion: 1, workflowId: scope.workflowId, rootThreadId: scope.rootThreadId,
    rootTurnIds: [...turns], selectedRequests: selected, excludedRequestIds: excluded.map(r => r.responseId),
    unresolvedRequestIds: unresolved,
    missingCaptureIds: [...parents.keys()].filter(id => !threads.has(id)),
    incompleteCaptureIds: captures.filter(c => c.incompleteTail).map(c => c.metadata.id),
    observedTotals, completion,
    allObservedTurnsCompleted: completion.every(c => c.started && c.completed && !c.interrupted),
    phase: 'snapshot', completeness: 'partial', usage: null, credits: null,
    limitations: ['Explicit root turns must contain only this workflow; mixed work within one root turn is not separable',
      'Version-specific rootTurnId attribution; persisted descendants may be incomplete',
      'Observed completion and stable snapshots do not guarantee final usage settlement',
      'No verified per-request pricing or enterprise credit conversion'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [scope, relations, output, ...captures] = process.argv.slice(2);
  if (!scope || !relations || !output || !captures.length) throw new Error('Usage: scope-usage.mjs <scope.json> <relations.json> <new-output.json> <capture.json>...');
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  const result = summarizeScope(read(scope), read(relations), captures.map(read));
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, selectedRequests: result.selectedRequests.length,
    excludedRequests: result.excludedRequestIds.length, observedTotals: result.observedTotals,
    allObservedTurnsCompleted: result.allObservedTurnsCompleted, completeness: result.completeness }));
}
