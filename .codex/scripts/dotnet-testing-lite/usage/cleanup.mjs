#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquire, assertPlainPath, assertPlainTree } from './lifecycle.mjs';

import { cleanupIndex, deployedWorkspace } from './workspace-index.mjs';

const terminalLifecycles = new Set(['completed', 'stopped', 'failed']);
const settledMeasurements = new Set(['observed-complete', 'incomplete']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
}

function nonNegativeInteger(value, name) {
  if (!/^\d+$/u.test(value ?? '')) throw new Error(`${name} 必須是非負整數`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw Error(`${name} 超出安全整數範圍`);
  return number;
}

export function parseCleanupArgs(argv) {
  const options = { apply: false, keep: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--apply') options.apply = true;
    else if (key === '--all-completed') options.allCompleted = true;
    else if (['--test-project', '--run-id', '--older-than-days', '--keep'].includes(key)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${key} 缺少值`);
      if (key === '--test-project') options.testProject = value;
      else if (key === '--run-id') options.runId = value;
      else if (key === '--older-than-days') options.olderThanDays = nonNegativeInteger(value, key);
      else options.keep = nonNegativeInteger(value, key);
      index += 1;
    } else throw new Error(`未知參數：${key}`);
  }
  if (!options.testProject) throw new Error('缺少 --test-project');
  const selectors = [Boolean(options.runId), options.olderThanDays !== undefined,
    Boolean(options.allCompleted)].filter(Boolean).length;
  if (selectors !== 1) {
    throw new Error('必須且只能指定 --run-id、--older-than-days 或 --all-completed 其中一種');
  }
  if (options.runId && options.keep !== 0) throw new Error('--run-id 不可搭配 --keep');
  return options;
}


function inspectRun(runDirectory, runId, testProjectPath, now) {
  try { assertPlainTree(runDirectory); } catch { return { eligible: false, reason: 'unsafe_path' }; }
  const targets = fs.readdirSync(runDirectory, { withFileTypes: true }).filter(e => e.isDirectory())
    .map(e => path.join(runDirectory, e.name));
  if (!targets.length) return { eligible: false, reason: 'missing_target' };
  const times = [];
  for (const target of targets) {
    let manifest;
    try { manifest = readJson(path.join(target, 'run.json')); } catch { return { eligible: false, reason: 'invalid_manifest' }; }
    if (manifest.runId !== runId || !terminalLifecycles.has(manifest.lifecycleStatus) || !manifest.terminalDecision)
      return { eligible: false, reason: 'not_terminal' };
    if (manifest.testProjectPath !== testProjectPath || manifest.runRoot !== target || manifest.manifestPath !== path.join(target, 'run.json'))
      return { eligible: false, reason: 'project_identity_mismatch' };
    const finished = manifest.terminalDecisionAtEpochMs;
    if (!Number.isSafeInteger(finished) || finished < 0 || finished > now)
      return { eligible: false, reason: 'invalid_completion_time' };
    times.push(finished);
    const usage = path.join(target, 'usage');
    if (fs.existsSync(usage)) {
      if (['.usage-writer.lock', '.recovery.lock'].some(name => fs.existsSync(path.join(usage, name)))) return { eligible: false, reason: 'observer_writing' };
      let observer;
      try { observer = readJson(path.join(usage, 'observer-state.json')); } catch { return { eligible: false, reason: 'usage_pending' }; }
      if (!['settled', 'failed', 'recovered'].includes(observer.status)) return { eligible: false, reason: 'usage_pending' };
      try {
        const result = readJson(path.join(usage, 'result.json'));
        if (!settledMeasurements.has(result.measurementStatus) || !fs.statSync(path.join(usage, 'result.html')).isFile())
          return { eligible: false, reason: 'invalid_usage_result' };
      } catch { return { eligible: false, reason: 'invalid_usage_result' }; }
    }
  }
  return { eligible: true, completedAtEpochMs: Math.max(...times), targets: targets.length, targetDirectories: targets };
}

export function planCleanup(options, now = Date.now()) {
  // Validate programmatic callers too.
  for (const [name, value] of [['keep', options.keep ?? 0], ['older-than-days', options.olderThanDays ?? 0]])
    nonNegativeInteger(String(value), name);
  if (options.olderThanDays !== undefined && !Number.isSafeInteger(options.olderThanDays * 86400000)) throw Error('天數超出安全範圍');
  const testProjectPath = assertPlainPath(options.testProject);
  if (!fs.statSync(testProjectPath).isFile()) throw Error('測試專案不是檔案');
  const orchestratorRoot = assertPlainPath(path.join(path.dirname(testProjectPath), '.orchestrator'));
  const runsRoot = assertPlainPath(path.join(orchestratorRoot, 'runs'));
  const base = { testProjectPath, runsRoot, selected: [], retained: [], skipped: [], apply: Boolean(options.apply),
    scope: '整個 run：用量 HTML、JSON 與測試證據；不經資源回收筒' };
  if (!fs.existsSync(runsRoot)) return base;
  let activeRunId;
  const activePath = path.join(orchestratorRoot, 'active-run.json');
  if (fs.existsSync(activePath)) {
    assertPlainPath(activePath);
    activeRunId = readJson(activePath).runId;
    if (typeof activeRunId !== 'string' || !activeRunId) throw Error('active lock 無效，拒絕清理');
  }
  const eligible = [];
  for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const runId = entry.name, directory = path.join(runsRoot, runId);
    if (runId === activeRunId) { base.skipped.push({ runId, reason: 'active_run' }); continue; }
    const inspection = inspectRun(directory, runId, testProjectPath, now);
    if (!inspection.eligible) { base.skipped.push({ runId, reason: inspection.reason }); continue; }
    eligible.push({ runId, directory, completedAtEpochMs: inspection.completedAtEpochMs, targets: inspection.targets });
  }
  eligible.sort((a,b) => b.completedAtEpochMs - a.completedAtEpochMs || b.runId.localeCompare(a.runId));
  base.retained = eligible.slice(0, options.keep ?? 0);
  const cutoff = options.olderThanDays === undefined ? null : now - options.olderThanDays * 86400000;
  base.selected = eligible.slice(options.keep ?? 0).filter(run => options.runId ? run.runId === options.runId :
    options.allCompleted ? true : cutoff !== null && run.completedAtEpochMs < cutoff);
  if (options.runId && !base.selected.length && !base.skipped.some(r => r.runId === options.runId)) base.skipped.push({ runId: options.runId, reason: 'not_found' });
  return base;
}

export function cleanupRuns(options, now = Date.now(), { remove = directory => fs.rmSync(directory, { recursive: true, force: false }), beforeApply = () => {}, workspace = deployedWorkspace } = {}) {
  const plan = planCleanup(options, now);
  const removed = [], failures = [];
  if (options.apply && plan.selected.length) {
    const release = acquire(plan.runsRoot, '.cleanup.lock');
    try {
      beforeApply(plan);
      for (const run of plan.selected) {
        const locks = [];
        try {
          const fresh = planCleanup({ ...options, apply: false }, now);
          if (!fresh.selected.some(r => r.runId === run.runId)) throw Error('狀態或選取範圍已變更');
          const inspection = inspectRun(run.directory, run.runId, plan.testProjectPath, now);
          if (!inspection.eligible) throw Error(inspection.reason);
          for (const target of inspection.targetDirectories) {
            const usage = path.join(target, 'usage');
            if (fs.existsSync(usage)) locks.push(acquire(usage));
          }
          // Observer cannot acquire its lifetime writer lock until deletion has finished.
          assertPlainTree(run.directory);
          remove(run.directory);
          removed.push(run.runId);
        } catch (error) { failures.push({ runId: run.runId, reason: error.message }); }
        finally { for (const unlock of locks.reverse()) { try { unlock(); } catch (error) { if (error.code !== 'ENOENT') failures.push({ runId: run.runId, reason: error.message }); } } }
      }
    } finally { release(); }
  }
  let indexCleanup;
  try {
    indexCleanup = cleanupIndex(workspace, Boolean(options.apply), {
      runDirectories: plan.selected.filter(run => !options.apply || removed.includes(run.runId)).map(run => run.directory),
      previewExisting: !options.apply,
    });
    failures.push(...indexCleanup.failures.map(item => ({ ...item, stage: 'usage_index' })));
  } catch (error) {
    indexCleanup = { selected: [], skipped: [], removed: [], failures: [{ reason: error.message }] };
    failures.push({ stage: 'usage_index', reason: error.message });
  }
  return { ...plan, scope: plan.scope + '；包含本次已刪除 run 的對應用量索引', mode: options.apply ? 'applied' : 'preview', removed, failures, indexCleanup };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = cleanupRuns(parseCleanupArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.failures.length) process.exitCode = 1;
  } catch (error) { process.stderr.write('Lite cleanup：' + error.message + '\n'); process.exitCode = 1; }
}
