import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
export function atomicJson(file, value) {
  const staging = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(staging, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(staging, file);
  } finally { if (fs.existsSync(staging)) fs.unlinkSync(staging); }
}
export function assertPlainPath(file) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw Error(`拒絕符號連結或 junction：${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return absolute;
}
export function assertPlainTree(directory) {
  assertPlainPath(directory);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error(`拒絕符號連結或 junction：${file}`);
    if (entry.isDirectory()) assertPlainTree(file);
    else if (!entry.isFile()) throw Error(`拒絕特殊檔案：${file}`);
  }
}
export function acquire(directory, name = '.usage-writer.lock') {
  assertPlainPath(directory);
  const file = path.join(directory, name);
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), createdAt: new Date().toISOString() })); }
  finally { fs.closeSync(fd); }
  return () => fs.unlinkSync(file);
}
export function processStopped(owner) {
  if (owner.host !== os.hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
  try { process.kill(owner.pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}
export function state(directory, status, extra = {}) {
  atomicJson(path.join(directory, 'observer-state.json'), {
    schemaVersion: 1, status, pid: process.pid, host: os.hostname(), updatedAt: new Date().toISOString(), ...extra,
  });
}
