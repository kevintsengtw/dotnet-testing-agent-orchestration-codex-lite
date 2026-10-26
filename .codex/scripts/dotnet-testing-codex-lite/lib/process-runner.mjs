import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const defaultLimit = 1024 * 1024; // Node spawnSync default; bytes per stream.

export function errorDetails(error) {
  if (!error) return null;
  return Object.fromEntries(['name', 'message', 'code', 'errno', 'syscall', 'path', 'spawnargs', 'stage']
    .filter(key => error[key] !== undefined).map(key => [key, error[key]]));
}

export function processDetails(result) {
  return {
    status: result.status ?? null, signal: result.signal ?? null,
    error: errorDetails(result.error),
    ...(result.capture ? { capture: result.capture } : {}),
  };
}

export function processFailure(result) {
  const details = processDetails(result);
  return JSON.stringify(details);
}

function captureError(stage, error) {
  return Object.assign(new Error(`${stage}: ${error.message}`, { cause: error }),
    errorDetails(error), { message: `${stage}: ${error.message}`, stage });
}

// Reject links in the managed path. The caller supplies an existing workspace/run directory;
// its canonical identity is the trust boundary (including Windows 8.3 path aliases).
function captureParent(root, io) {
  // Win32 mkdtemp rejects deep paths without the namespace prefix even when the
  // existing run directory is readable. Keep capture inside the same canonical root.
  let directory = path.toNamespacedPath(io.realpathSync(path.resolve(root)));
  if (!io.statSync(directory).isDirectory()) throw Error(`擷取根目錄不是目錄：${directory}`);
  for (const part of ['.orchestrator', 'process-output']) {
    directory = path.join(directory, part);
    try { io.mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = io.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error(`拒絕非一般擷取目錄：${directory}`);
  }
  return directory;
}

/** Synchronous, single invocation. Windows captures into files, never retries with pipes.
 * maxBuffer limits retained bytes per stream AFTER exit, not disk growth or execution time.
 * timeout retains spawnSync semantics, including no deadline when absent/zero.
 */
export function runProcess(command, args, options = {},
  { platform = process.platform, spawn = spawnSync, io = fs } = {}) {
  const { captureRoot = options.cwd ?? process.cwd(), ...spawnOptions } = options;
  if (platform !== 'win32') return spawn(command, args, spawnOptions);

  const encoding = options.encoding;
  const empty = () => encoding && encoding !== 'buffer' ? '' : Buffer.alloc(0);
  let result = { pid: 0, status: null, signal: null, stdout: empty(), stderr: empty() };
  const errors = [], files = [];
  let directory, identity, stage = 'prepare';
  const record = (where, error) => errors.push(captureError(where, error));
  const limit = options.maxBuffer ?? defaultLimit;
  const sizes = {};
  try {
    if (!Number.isSafeInteger(limit) || limit < 0) throw Error('maxBuffer 必須是非負安全整數');
    if (options.input !== undefined || options.stdio !== undefined) throw Error('檔案擷取不接受 input 或 stdio 覆寫');
    directory = io.mkdtempSync(path.join(captureParent(captureRoot, io), 'capture-'));
    identity = io.lstatSync(directory);
    for (const stream of ['stdout', 'stderr']) {
      const file = path.join(directory, `${stream}.log`);
      const fd = io.openSync(file, 'wx+', 0o600);
      files.push({ stream, file, fd });
    }
    stage = 'spawn';
    const spawned = spawn(command, args, { ...spawnOptions, stdio: ['ignore', files[0].fd, files[1].fd] });
    result = { ...spawned, stdout: empty(), stderr: empty() };
  } catch (error) {
    if (stage === 'spawn') result.error = error; // Keep the original launch error object.
    else record(stage, error);
  } finally {
    // Read through the owned descriptors: no reopening a potentially replaced output path.
    // Bounded reads also protect memory if an inherited descendant keeps writing after exit.
    for (const { stream, fd } of files) {
      try {
        const size = io.fstatSync(fd).size;
        sizes[stream] = size;
        if (size > limit) record('output-limit', Object.assign(
          Error(`${stream} 輸出 ${size} bytes，超過 ${limit} bytes；內容已截斷`),
          { code: 'ENOBUFS' }));
        const buffer = Buffer.alloc(Math.min(size, limit));
        let offset = 0;
        while (offset < buffer.length) {
          const read = io.readSync(fd, buffer, offset, buffer.length - offset, offset);
          if (read === 0) break;
          offset += read;
        }
        const bytes = buffer.subarray(0, offset);
        result[stream] = encoding && encoding !== 'buffer' ? bytes.toString(encoding) : bytes;
      } catch (error) { record('output-read', error); }
      try { io.closeSync(fd); } catch (error) { record('close', error); }
    }
    if (directory) {
      try {
        const current = io.lstatSync(directory);
        if (current.isSymbolicLink() || !current.isDirectory() ||
            current.dev !== identity?.dev || current.ino !== identity?.ino) {
          throw Error(`擷取目錄身分已變更，保留現場：${directory}`);
        }
        // Never recursively remove a shared directory or scan another invocation's files.
        for (const { file } of files) {
          try { io.unlinkSync(file); } catch (error) { record('cleanup', error); }
        }
        io.rmdirSync(directory);
      } catch (error) { record('cleanup', error); }
    }
  }
  if (!result.error && errors.length) result.error = errors[0];
  result.capture = { method: 'files', limitBytes: limit, sizes,
    ...(errors.length ? { directory, errors: errors.map(errorDetails) } : {}) };
  result.output = [null, result.stdout, result.stderr];
  return result;
}
