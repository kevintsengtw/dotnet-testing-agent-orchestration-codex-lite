import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquire, assertPlainTree, processStopped, readJson, state } from './lifecycle.mjs';
import { saveResult } from './observer.mjs';

export function recoverObserver(directory, { apply = false, stopped = processStopped } = {}) {
  directory = path.resolve(directory);
  assertPlainTree(directory);
  const readOwner = () => {
    const current = readJson(path.join(directory, 'observer-state.json'));
    return current.status === 'starting' ? { ...current, ...readJson(path.join(directory, 'launch-owner.json')) } : current;
  };
  const owner = readOwner();
  if (['settled', 'failed', 'recovered'].includes(owner.status)) throw Error('observer 已收尾，不需復原');
  if (!stopped(owner)) throw Error('無法確認 observer 已停止；不以逾時或 PID 存在推測身分');
  const lock = path.join(directory, '.usage-writer.lock');
  if (fs.existsSync(lock) && !stopped(readJson(lock))) throw Error('writer 尚未確認停止');
  if (apply) {
    const recoveryRelease = acquire(directory, '.recovery.lock');
    try {
      if (!stopped(readOwner())) throw Error('observer 狀態已變更');
      if (fs.existsSync(lock)) {
        if (!stopped(readJson(lock))) throw Error('writer 狀態已變更');
        fs.unlinkSync(lock);
      }
      const release = acquire(directory);
      try {
        saveResult(directory, null, false, '已確認原 observer 程序不存在；中斷用量無法保證完整。');
        state(directory, 'recovered', { previousOwner: owner });
      } finally { release(); }
    } finally { recoveryRelease(); }
  }
  return { directory, mode: apply ? 'applied' : 'preview', status: 'recoverable', previousOwner: owner };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args[0] || args.slice(1).some(arg => arg !== '--apply')) throw Error('用法：node recover.mjs <usage-directory> [--apply]');
    console.log(JSON.stringify(recoverObserver(args[0], { apply: args.includes('--apply') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
