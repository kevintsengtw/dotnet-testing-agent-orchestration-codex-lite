import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertPlainPath, readJson } from './lifecycle.mjs';

export const deployedWorkspace = path.resolve(import.meta.dirname, '../../../..');
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export function indexDirectory(workspace = deployedWorkspace) {
  return assertPlainPath(path.join(workspace, '.orchestrator', 'dotnet-testing-lite', 'usage-turns'));
}
export function claimTurn(workspace, manifest, identity) {
  workspace = assertPlainPath(workspace);
  const manifestPath = assertPlainPath(manifest.manifestPath);
  if (!inside(workspace, manifestPath)) throw Error('用量繫結只能指向已部署工作區內的 run');
  const directory = indexDirectory(workspace);
  fs.mkdirSync(directory, { recursive: true });
  const key = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const file = path.join(directory, `${key}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, workspace, workflowId: manifest.runId, manifestPath }), { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw Error('此工作區的同一主代理回合已繫結 workflow；請另開回合。');
    throw error;
  }
  return file;
}

// Only remove orphaned index entries. Existing runs must go through run cleanup first.
export function cleanupIndex(workspace = deployedWorkspace, apply = false, { runDirectories, previewExisting = false } = {}) {
  workspace = assertPlainPath(workspace);
  const directory = indexDirectory(workspace), selected = [], skipped = [], removed = [], failures = [];
  if (!fs.existsSync(directory)) return { selected, skipped, removed, failures };
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    try {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) throw Error('未知索引項目');
      const record = readJson(file);
      if (record.schemaVersion !== 1 || record.workspace !== workspace || typeof record.manifestPath !== 'string' ||
          !inside(workspace, path.resolve(record.manifestPath))) throw Error('索引身分無法確認');
      assertPlainPath(record.manifestPath);
      if (runDirectories) {
        const runDirectory = path.dirname(path.dirname(record.manifestPath));
        if (!runDirectories.includes(runDirectory)) continue;
        if (record.workflowId !== path.basename(runDirectory) || path.basename(record.manifestPath) !== 'run.json')
          throw Error('索引與 run 身分不符');
      }
      if ((apply || !previewExisting) && fs.existsSync(path.dirname(record.manifestPath))) throw Error('run 仍存在；先使用 run cleanup');
      selected.push(file);
      if (apply) {
        // A run never reuses an ID; recheck before removing only this index file.
        if (fs.existsSync(path.dirname(record.manifestPath))) throw Error('run 狀態已變更');
        fs.unlinkSync(file); removed.push(file);
      }
    } catch (error) {
      (selected.includes(file) ? failures : skipped).push({ file, reason: error.message });
    }
  }
  if (apply) {
    try { if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); }
    catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) failures.push({ file: directory, reason: error.message }); }
  }
  return { selected, skipped, removed, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--apply')) throw Error('用法：node workspace-index.mjs [--apply]');
    const result = cleanupIndex(deployedWorkspace, process.argv.includes('--apply'));
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
