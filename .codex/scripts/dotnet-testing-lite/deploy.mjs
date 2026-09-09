import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { acquire, assertPlainPath, assertPlainTree, atomicJson, readJson } from './usage/lifecycle.mjs';

export const skills = [
  'dotnet-test', 'dotnet-testing-awesome-assertions-guide', 'dotnet-testing-code-coverage-analysis',
  'dotnet-testing-datetime-testing-timeprovider', 'dotnet-testing-filesystem-testing-abstractions',
  'dotnet-testing-fluentvalidation-testing', 'dotnet-testing-nsubstitute-mocking',
  'dotnet-testing-test-naming-conventions', 'dotnet-testing-unit-authoring', 'dotnet-testing-unit-patterns',
  'dotnet-testing-unit-test-fundamentals', 'dotnet-testing-xunit-project-setup', 'unit-test-scenarios',
].map(name => `${name}-lite`);
const roots = ['.codex/scripts/dotnet-testing-lite', '.codex/skills/dotnet-testing-lite-orchestrator-unit',
  ...skills.map(name => `.codex/skills/${name}`)];
const agents = ['author', 'verifier'].map(role => `.codex/agents/dotnet-testing-lite-unit-${role}.toml`);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const owned = name => agents.includes(name) || roots.some(root => name.startsWith(root + '/'));
function files(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name), `${prefix}/${entry.name}`) : [`${prefix}/${entry.name}`]);
}
function safe(root, relative) {
  const file = path.resolve(root, relative);
  if (path.relative(root, file).startsWith('..') || path.isAbsolute(path.relative(root, file))) throw Error('部署路徑越界');
  return assertPlainPath(file);
}

// This is a consumer installer. sync-public.mjs remains a dedicated public-repository snapshot builder.
export function deploy({ source = path.resolve(import.meta.dirname, '../../..'), workspace, remove = false, apply = false }) {
  source = assertPlainPath(source); workspace = assertPlainPath(workspace);
  if (source === workspace) throw Error('來源與工作區不可相同');
  const receiptPath = safe(workspace, '.codex/dotnet-testing-lite-install.json');
  const previous = fs.existsSync(receiptPath) ? readJson(receiptPath) : { files: {} };
  if (!previous.files || Object.entries(previous.files).some(([name, digest]) => !owned(name) || !/^[a-f0-9]{64}$/.test(digest))) throw Error('安裝清單無效');
  let incoming = {};
  if (!remove) {
    for (const root of roots) assertPlainTree(safe(source, root));
    incoming = Object.fromEntries([...agents, ...roots.flatMap(root => files(path.join(source, root), root))]
      .map(name => [name, hash(safe(source, name))]));
  }
  const writes = [], deletes = [], preserved = [];
  for (const [name, digest] of Object.entries(incoming)) {
    const destination = safe(workspace, name);
    if (fs.existsSync(destination)) {
      const current = hash(destination);
      if (current !== digest && current !== previous.files[name]) throw Error(`拒絕覆寫非本次安裝管理或已修改檔案：${name}`);
    }
    writes.push(name);
  }
  for (const [name, digest] of Object.entries(previous.files)) {
    if (name in incoming) continue;
    const destination = safe(workspace, name);
    if (!fs.existsSync(destination)) continue;
    if (hash(destination) === digest) deletes.push(name); else preserved.push(name);
  }
  // Baseline legacy runtime only; never delete same-name shared skills or historical runs.
  const legacy = readJson(path.join(import.meta.dirname, 'legacy-runtime-hashes.json'));
  for (const [name, digest] of Object.entries(legacy)) {
    if (!name.startsWith('.codex/scripts/lite-unit/') || name.includes('..')) throw Error('舊版清單越界');
    const destination = safe(workspace, name);
    if (fs.existsSync(destination)) {
      if (crypto.createHash('sha256').update(fs.readFileSync(destination, 'utf8').replaceAll('\r\n', '\n')).digest('hex') === digest) deletes.push(name); else preserved.push(name);
    }
  }
  if (apply) {
    fs.mkdirSync(safe(workspace, '.codex'), { recursive: true });
    const release = acquire(path.join(workspace, '.codex'), '.dotnet-testing-lite-install.lock');
    try {
      // Revalidate the complete plan under the installation lock before mutation.
      const current = deploy({ source, workspace, remove, apply: false });
      if (JSON.stringify([writes, deletes, preserved]) !== JSON.stringify([current.writes, current.deletes, current.preserved])) throw Error('部署狀態已變更');
      for (const name of writes) {
        const destination = safe(workspace, name);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(safe(source, name), destination);
      }
      for (const name of deletes) fs.unlinkSync(safe(workspace, name));
      // Keep ownership for preserved modified files, allowing a later explicit restoration/uninstall.
      const retained = Object.fromEntries(preserved.filter(name => owned(name)).map(name => [name, previous.files[name]]));
      atomicJson(receiptPath, { schemaVersion: 1, files: { ...retained, ...incoming } });
    } finally { release(); }
  }
  return { mode: apply ? 'applied' : 'preview', operation: remove ? 'remove' : 'install', workspace,
    writes, deletes, preserved, configuration: '共用 .codex/config.toml 不覆寫；合併 public 設定所需 features.multi_agent 與 agents 設定。' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--apply') options.apply = true;
      else if (args[i] === '--remove') options.remove = true;
      else if (['--source', '--workspace'].includes(args[i]) && args[i + 1]) options[args[i++].slice(2)] = args[i];
      else throw Error('用法：node deploy.mjs --workspace <path> [--source <snapshot>] [--remove] [--apply]');
    }
    if (!options.workspace) throw Error('缺少 --workspace');
    console.log(JSON.stringify(deploy(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
