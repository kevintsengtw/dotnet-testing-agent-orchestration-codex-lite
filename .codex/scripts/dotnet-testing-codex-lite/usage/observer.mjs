import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runProcess, processDetails, processFailure } from '../lib/process-runner.mjs';
import { pathToFileURL } from 'node:url';
import { acquire, atomicJson, state } from './lifecycle.mjs';
import { collect } from './collect-session.mjs';
import { summarizeScope, measurementScope } from './scope-usage.mjs';
import { usageRows, creditGroups } from './usage-presentation.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = atomicJson;

export function ready(report, manifest) {
  return manifest.lifecycleStatus !== 'running' && Boolean(manifest.terminalDecision) &&
    report.allObservedTurnsCompleted && report.selectedRequests.length > 0 &&
    [report.missingCaptureIds, report.incompleteCaptureIds, report.unresolvedRequestIds].every(a => a.length === 0) &&
    ['input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens']
      .every(k => Number.isSafeInteger(report.observedTotals[k]));
}

export function renderResult(state) {
  const template = fs.readFileSync(path.join(import.meta.dirname, 'dashboard.html'), 'utf8');
  return template.replace('<script>', `<script>window.acceptanceSnapshot=${JSON.stringify(state).replaceAll('<', '\\u003c')};</script><script>`);
}

export function takeSnapshot(binding, directory, run = runProcess) {
  const relationFile = path.join(directory, 'relations.json');
  // discover-threads uses exclusive creation. A unique staging file prevents replacement races.
  const staging = path.join(directory, `relations-${crypto.randomUUID()}.json`);
  const python = detectPython(run, directory);
  const result = run(python, ['-B', path.join(import.meta.dirname, 'discover-threads.py'),
    binding.database, binding.rootThreadId, staging], { encoding: 'utf8', windowsHide: true, timeout: 10000, captureRoot: directory });
  if (result.error || result.status !== 0 || result.signal) throw Object.assign(
    new Error(`無法讀取代理關係：${processFailure(result)}\n${result.stderr || result.stdout || ''}`),
    { process: processDetails(result) });
  const relations = read(staging);
  fs.renameSync(staging, relationFile);
  const ids = [...new Set([binding.rootThreadId, ...relations.edges.map(e => e.childThreadId)])];
  const captures = ids.map(threadId => collect({ sessionsRoot: binding.sessionsRoot, threadId }));
  const report = summarizeScope(binding, relations, captures);
  return { report, captures, manifest: read(binding.manifestPath) };
}

function readBinding(directory) {
  try { return read(path.join(directory, 'binding.json')); } catch { return null; }
}

function readWorkflowManifest(directory) {
  try {
    const binding = readBinding(directory);
    return read(binding?.manifestPath || path.join(directory, '..', 'run.json'));
  } catch {
    // Missing or unreadable workflow evidence is unknown, not an unfinished test run.
    return null;
  }
}

function workflowIdentity(manifest) {
  return manifest ? { id: manifest.runId ?? null, target: manifest.targetClass ?? null } : null;
}

function publishResult(directory, result) {
  write(path.join(directory, 'result.json'), result);
  fs.writeFileSync(path.join(directory, 'result.html'), renderResult(result));
}

// Terminal reporting can precede root-turn completion or follow an observer failure.
// Preserve measured rows and diagnostics, and never race a live observer's writer.
export function refreshWorkflowOutcome(directory, manifest = readWorkflowManifest(directory)) {
  if (!manifest?.terminalDecision || !fs.existsSync(path.join(directory, 'result.json'))) return false;
  let release;
  try { release = acquire(directory); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try {
    const result = read(path.join(directory, 'result.json'));
    publishResult(directory, { ...result, outcome: manifest.terminalDecision,
      workflow: workflowIdentity(manifest), updatedAt: new Date().toISOString() });
    return true;
  } finally { release(); }
}

export function saveResult(directory, snapshot, complete, message) {
  const manifest = snapshot?.manifest || readWorkflowManifest(directory);
  const state = { done: true, updatedAt: new Date().toISOString(),
    outcome: manifest?.terminalDecision || null, workflow: workflowIdentity(manifest),
    measurementScope: snapshot?.report.measurementScope || measurementScope(readBinding(directory)), message,
    usageRows: snapshot ? usageRows(snapshot.report, snapshot.captures) : [],
    creditGroups: complete ? creditGroups(snapshot.report, snapshot.captures) : [],
    measurementStatus: complete ? 'observed-complete' : 'incomplete' };
  if (snapshot) {
    write(path.join(directory, 'report.json'), snapshot.report);
    for (const capture of snapshot.captures) write(path.join(directory, `${capture.metadata.id}.json`), capture);
  }
  publishResult(directory, state);
  return state;
}

async function observeCore(bindingPath, { timeoutMs = 7200000, intervalMs = 2000,
  sample = takeSnapshot, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now, open = () => {} } = {}) {
  const binding = read(bindingPath), directory = path.dirname(bindingPath);
  const deadline = now() + timeoutMs;
  let snapshot, signature, stable = 0, lastError = '';
  while (now() < deadline) {
    try {
      // Do not rescan descendants throughout model execution. Wait for the bound root turn.
      const root = collect({ sessionsRoot: binding.sessionsRoot, threadId: binding.rootThreadId });
      const ended = binding.rootTurnIds.every(id => root.events.some(e =>
        ['task_complete', 'turn_aborted'].includes(e.type) && e.turnId === id));
      if (ended) {
        snapshot = sample(binding, directory);
        if (snapshot.manifest.lifecycleStatus === 'running') {
          lastError = '主代理回合已結束，但 workflow 尚未完成；跨回合續跑未納入自動量測。';
          break;
        }
        const next = JSON.stringify(snapshot.report.selectedRequests);
        stable = ready(snapshot.report, snapshot.manifest) ? (signature === next ? stable + 1 : 1) : 0;
        signature = next;
        if (stable >= 3) {
          saveResult(directory, snapshot, true,
            '本次主代理回合已完成，連續三次觀測用量一致。同回合多個 workflow 共用這筆用量，不可跨報告相加。這是 runtime 觀測值，非帳戶實際扣抵。');
          open(path.join(directory, 'result.html'));
          return;
        }
        if (root.events.some(e => e.type === 'turn_aborted' && binding.rootTurnIds.includes(e.turnId))) {
          lastError = '主代理回合中止，用量未確認完整。';
          break;
        }
      }
    } catch (error) {
      lastError = error.message; stable = 0; signature = undefined;
      if (error.process) break; // A failed command is not a reason to execute it again.
    }
    await pause(intervalMs);
  }
  saveResult(directory, snapshot, false, `用量尚未確認完整，不提供 credit 合計。${lastError || '背景觀測已達兩小時上限。'}`);
  open(path.join(directory, 'result.html'));
}

export function detectPython(run = runProcess, captureRoot = process.cwd()) {
  const failures = [];
  for (const command of ['python', 'python3']) {
    const result = run(command, ['-B', '-c', 'import sys, sqlite3; assert sys.version_info >= (3, 8)'],
      { encoding: 'utf8', windowsHide: true, timeout: 10000, captureRoot });
    if (!result.error && !result.signal && result.status === 0) return command;
    const diagnostic = `${command}: ${processFailure(result)}\n${result.stderr || result.stdout || ''}`;
    // Only an absent executable may fall through after a launch error; EPERM is not a missing Python.
    if (result.signal || (result.error && (result.error.code !== 'ENOENT' || result.capture?.errors?.length))) {
      throw Object.assign(Error(`Python 執行或輸出擷取失敗：${diagnostic}`), { process: processDetails(result) });
    }
    failures.push(diagnostic);
  }
  throw Error(`用量收集需要 Python 3.8+ 與 sqlite3；找不到可用的 python 或 python3。Cleanup 只需要 Node.js。\n${failures.join('\n')}`);
}

export async function observe(bindingPath, options = {}) {
  const directory = path.dirname(bindingPath);
  const release = acquire(directory);
  state(directory, 'running');
  // Signal handlers publish failure synchronously, then terminate without further writes.
  const stop = signal => {
    try { saveResult(directory, null, false, signal + '：背景觀測中止'); state(directory, 'failed', { reason: signal }); }
    finally { release(); process.exit(1); }
  };
  const onTerm = () => stop('SIGTERM'), onInt = () => stop('SIGINT');
  process.once('SIGTERM', onTerm); process.once('SIGINT', onInt);
  try {
    await observeCore(bindingPath, options);
    state(directory, 'settled'); // Only after every JSON and HTML write has succeeded.
  } catch (error) {
    try { saveResult(directory, null, false, error.message); } finally { state(directory, 'failed', { reason: error.message }); }
    throw error;
  } finally {
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
    release();
    // Main may have reached terminal while the observer still held the writer lock.
    refreshWorkflowOutcome(directory);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  observe(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
