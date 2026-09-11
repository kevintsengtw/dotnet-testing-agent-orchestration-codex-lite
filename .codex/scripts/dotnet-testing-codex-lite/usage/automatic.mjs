import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { claimTurn, deployedWorkspace } from './workspace-index.mjs';
import { state, atomicJson, assertPlainPath } from './lifecycle.mjs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { collect } from './collect-session.mjs';
import { renderResult, saveResult, detectPython } from './observer.mjs';

const supportedRootSources = new Set(['cli', 'vscode']);

export function appendUsageLink(manifest) {
  try {
    const directory = path.join(manifest.runRoot, 'usage');
    const bindingPath = path.join(directory, 'binding.json');
    const page = path.join(directory, 'result.html');
    if (!fs.existsSync(bindingPath)) {
      const statePath = path.join(directory, 'observer-state.json');
      if (!fs.existsSync(statePath)) return;
      const failure = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (failure.status !== 'failed') return;
      const reason = String(failure.reason ?? '原因未提供').replace(/[\r\n]+/gu, ' ');
      fs.appendFileSync(manifest.paths.resultMarkdown,
        `\n## 本次 workflow 用量\n\n用量收集啟動失敗，沒有可用的統計資料。原因：${reason}\n` +
        (fs.existsSync(page) ? `\n診斷網頁（非統計結果）：\n\n\`\`\`text\n${pathToFileURL(page).href}\n\`\`\`\n` : ''));
      return;
    }
    if (!fs.existsSync(page)) return;
    const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
    if (binding.workflowId !== manifest.runId) return;
    const url = pathToFileURL(page).href;
    fs.appendFileSync(manifest.paths.resultMarkdown,
      `\n## 本次 workflow 用量網頁\n\n複製下列網址，貼到本機瀏覽器網址列開啟：\n\n\`\`\`text\n${url}\n\`\`\`\n\n背景量測須等本回合最後回覆完成才收尾；若頁面仍顯示等待，請稍後重新整理。不會自動開啟瀏覽器，也不需要 /exit。\n`);
  } catch (error) {
    process.stderr.write(`無法附上用量網址（不影響測試判定）：${error.message}\n`);
  }
}

export function activeRootTurn(capture) {
  if (capture.incompleteTail || capture.metadata.parentThreadId) throw new Error('主代理紀錄尚不完整');
  const pending = new Set();
  for (const e of capture.events) {
    if (e.type === 'task_started') pending.add(e.turnId);
    if (['task_complete', 'turn_aborted'].includes(e.type)) pending.delete(e.turnId);
  }
  if (pending.size !== 1 || ![...pending][0]) throw new Error('無法唯一識別目前回合');
  return [...pending][0];
}

// Optional observer: never changes driver actions, gates, or terminal decisions.
export function startAutomaticUsage(manifest, env = process.env, launch = spawn, workspace = deployedWorkspace) {
  if (env.LITE_USAGE_AUTOMATIC === '0' || env.LITE_USAGE_BINDING_PATH || !env.CODEX_THREAD_ID) return;
  const directory = path.join(manifest.runRoot, 'usage');
  let created = false;
  const failed = error => {
    if (created) {
      saveResult(directory, null, false, `背景觀測啟動失敗：${error.message}`);
      state(directory, 'failed', { reason: error.message });
    }
  };
  try {
    const codexDirectory = env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const sessionsRoot = path.join(codexDirectory, 'sessions');
    const capture = collect({ sessionsRoot, threadId: env.CODEX_THREAD_ID });
    if (!supportedRootSources.has(capture.metadata.source)) return;
    const turnId = activeRootTurn(capture);
    if (fs.existsSync(directory)) throw Error("此 run 已有用量資料，拒絕重新啟動");
    assertPlainPath(directory);
    fs.mkdirSync(directory, { recursive: true });
    created = true;
    claimTurn(workspace, manifest, [sessionsRoot, env.CODEX_THREAD_ID, turnId]);
    state(directory, 'starting');
    detectPython();
    const binding = { schemaVersion: 1, workflowId: manifest.runId,
      rootThreadId: env.CODEX_THREAD_ID, rootTurnIds: [turnId],
      manifestPath: manifest.manifestPath, sessionsRoot,
      database: path.join(codexDirectory, 'state_5.sqlite'),
      runtimeSource: capture.metadata.source,
      cliVersion: capture.metadata.cliVersion,
      boundAt: new Date().toISOString(),
      limitations: ['同一工作區的 root turn 僅限一個 workflow；不支援跨回合續跑或同回合混入其他工作'] };
    const bindingPath = path.join(directory, 'binding.json');
    fs.writeFileSync(bindingPath, JSON.stringify(binding, null, 2), { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'result.html'), renderResult({ done: true,
      measurementStatus: 'pending', message: '等待主代理本回合完成及用量收尾，請稍後重新整理本頁。',
      usageRows: [], creditGroups: [] }), { flag: 'wx' });
    const log = fs.openSync(path.join(directory, 'observer.log'), 'a');
    try {
      const child = launch(process.execPath, [path.join(import.meta.dirname, 'observer.mjs'), bindingPath],
        { detached: true, windowsHide: true, stdio: ['ignore', log, log], env });
      child.on('error', error => { try { failed(error); } catch (failure) { process.stderr.write(failure.message + '\n'); } });
      if (child.pid) atomicJson(path.join(directory, 'launch-owner.json'), { pid: child.pid, host: os.hostname() });
      child.unref();
    } finally { fs.closeSync(log); }
    process.stderr.write(`Codex 用量背景收集中；完成後結果：${path.join(directory, 'result.html')}\n`);
  } catch (error) {
    try { failed(error); } catch (failure) { process.stderr.write(failure.message + '\n'); }
    process.stderr.write(`Codex 自動用量未啟動（不影響測試流程）：${error.message}\n`);
  }
}
