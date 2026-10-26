import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function bindAgent(manifest, { agentId, dispatchId }) {
  const phase = manifest.phases.at(-1);
  if (manifest.lifecycleStatus !== "running" || phase?.status !== "running") throw Error("不能登記已終止的 phase");
  if (!agentId || /\s/u.test(agentId)) throw Error("agent ID 必須原樣使用工具回傳值");
  if (!dispatchId || phase.dispatchId !== dispatchId) throw Error("dispatch ID 不符合目前 phase");
  const existing = manifest.agentIds?.[phase.role];
  if (existing && existing !== agentId) throw Error("同一角色不得替換或重複派遣 agent；先停止並處理原代理");
  if (Object.entries(manifest.agentIds ?? {}).some(([role, id]) => role !== phase.role && id === agentId)) {
    throw Error("Author 與 Verifier 必須是不同代理");
  }
  manifest.agentIds = { ...manifest.agentIds, [phase.role]: agentId };
  phase.agentId = agentId;
  // This is driver registration time, not runtime dispatchAcceptedAt.
  phase.agentRegisteredAt ??= new Date().toISOString();
  return { type: "agent_bound", role: phase.role, mode: phase.mode, agentId, dispatchId };
}

export function assertPhaseAgent(manifest, { agentId, dispatchId }) {
  if (!manifest.requireAgentBinding) return;
  const phase = manifest.phases.at(-1);
  if (!phase.agentId || agentId !== phase.agentId || dispatchId !== phase.dispatchId) {
    throw Error("advance 必須提供已登記的 agent ID 與目前 dispatch ID；不得用錯誤 ID 重新派遣");
  }
}

export function preserveTerminalEvidence(manifest) {
  const destination = path.join(manifest.runRoot, "terminal-evidence");
  fs.mkdirSync(destination); // Never overwrite an earlier terminal snapshot.
  const files = [];
  function copy(source, relative) {
    const stat = fs.lstatSync(source);
    if (!stat.isFile()) return;
    const bytes = fs.readFileSync(source);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" });
    files.push({ source, snapshot: relative, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
  function visit(source, relative) {
    if (!fs.existsSync(source)) return;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(source, entry.name), path.join(relative, entry.name));
      else if (entry.isFile()) copy(path.join(source, entry.name), path.join(relative, entry.name));
    }
  }
  for (const directory of ["author", "verification", "repair", "dispatch", "observations", "baseline", "stops", "input", "result"]) {
    visit(path.join(manifest.runRoot, directory), directory);
  }
  copy(manifest.manifestPath, "run.json");
  const delivery = new Set([manifest.testProjectPath, manifest.outputTestPath]);
  for (const file of [manifest.paths.authorInitial, manifest.paths.authorRepair]) {
    try {
      const author = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const item of author.testFilePaths ?? []) delivery.add(path.resolve(path.dirname(manifest.testProjectPath), item));
    } catch { /* Invalid/missing author output is preserved as raw evidence above. */ }
  }
  let index = 0;
  for (const file of delivery) {
    if (!file) continue;
    const relative = path.relative(path.dirname(manifest.testProjectPath), file);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    if (fs.existsSync(file)) copy(file, path.join("delivery", `${index++}-${path.basename(file)}`));
  }
  const inventory = path.join(destination, "inventory.json");
  fs.writeFileSync(inventory, JSON.stringify({ schemaVersion: 1, files }, null, 2) + "\n", { flag: "wx" });
  return inventory;
}

export function finalDelivery(manifestPath) {
  return {
    command: "handoff",
    manifestPath,
    scope: "all-terminal-manifests-from-this-request",
    instruction: "先確認本次所有目標與代理均已終止，完成證據整理；最後以 handoff --manifest 傳入本次所有 terminal manifests。將完整 stdout 直接作為最終回覆，不摘要、不重寫，不省略測試內容、異常、交付、耗時、限制或用量網址。",
    truncatedOutput: "若工具輸出截斷，依目標順序完整讀取各 resultMarkdownPath，保留每份全文後交付；不得依片段補寫或摘要。",
  };
}

export function collectHandoff(manifestPaths) {
  if (!manifestPaths?.length) throw Error("handoff 至少需要一個 --manifest");
  const seen = new Set();
  const results = manifestPaths.map((file) => {
    const resolved = path.resolve(file);
    if (seen.has(resolved)) throw Error("handoff 不得重複同一個 manifest");
    seen.add(resolved);
    const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
    if (manifest.lifecycleStatus === "running" || !manifest.terminalDecision) throw Error("handoff 只接受已終止的 run");
    const result = JSON.parse(fs.readFileSync(manifest.paths.result, "utf8"));
    if (result.identity.runId !== manifest.runId || result.outcome.terminalDecision !== manifest.terminalDecision) {
      throw Error("handoff result 與 manifest 不一致");
    }
    return fs.readFileSync(manifest.paths.resultMarkdown, "utf8");
  });
  return results.join("\n\n---\n\n");
}
