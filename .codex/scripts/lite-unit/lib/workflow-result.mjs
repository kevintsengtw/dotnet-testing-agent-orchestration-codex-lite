import fs from "node:fs";
import path from "node:path";
import { parseTrxTestResults } from "./trx.mjs";
import { collectTestMethods } from "./test-source-analysis.mjs";

const statusLabels = {
  completed: "已完成", stopped: "已停止", pass: "通過", passed: "通過",
  fail: "失敗", failed: "失敗", blocked: "無法繼續", unavailable: "無法取得",
  not_run: "未執行", not_applicable: "不適用", best_effort: "部分完成",
  complete: "完整", issues: "有待改善", partial: "部分交付",
  no_valuable_tests: "沒有值得建立的測試", needs_repair: "需要修正",
  not_suitable: "不適合單元測試", environment_blocked: "環境保護停止",
  tool_incident: "工具異常", not_observed: "未觀察到", implemented: "已實作",
  rejected: "未採用", limited: "有限採用", merged: "已合併", normalized: "已正規化",
  supplemented: "已補強", reviewed: "已審查", eligible: "符合修正資格",
  quality: "品質補強", coverage: "Coverage 補強",
  "coverage-and-quality": "Coverage 與品質補強", "test-delivery": "測試交付修正",
  mixed: "多類缺口修正",
  covered: "已涵蓋", "not-applicable": "不適用",
  environment_protection: "環境保護", integrity: "完整性失敗", contract: "契約失敗",
};
const phaseLabels = {
  "author:initial": "Author 初次建立", "verifier:initial": "Verifier 初次驗證",
  "author:repair": "Author 修正", "verifier:final": "Verifier 最終驗證",
  orchestrator: "Orchestrator",
};
const phasePurpose = {
  "author:initial": "分析行為、設計情境、建立並自我驗證測試",
  "verifier:initial": "Build、test、coverage、完整性與品質審查",
  "author:repair": "依 Verifier 證據修正測試交付",
  "verifier:final": "修正後重新驗證與作成最終判定",
};
const categoryLabels = {
  happy: "正常行為", boundary: "邊界條件", exception: "例外處理",
  branch: "分支與規則", state: "狀態與副作用", characterization: "既有行為刻畫",
};
const incidentKindLabels = {
  "build-failure": "Build 失敗", "command_error": "命令錯誤",
  "command-error": "命令錯誤", "gate-failure": "Gate 失敗",
  "test-failure": "測試失敗", "tool-error": "工具錯誤",
  "gate-validation": "Gate 驗證失敗", "test-platform": "測試平台異常",
  telemetry_unavailable: "Telemetry 無法取得",
};
function available(value) { return value !== undefined && value !== null && value !== ""; }
function label(value, fallback = "無法取得") {
  return available(value) ? statusLabels[value] ?? String(value) : fallback;
}
function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/gu, "<br>");
}
function code(value) {
  return available(value) ? `\`${String(value).replaceAll("`", "\\`")}\`` : "無法取得";
}
function table(headers, rows) {
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ];
}
function duration(valueMs) {
  if (!Number.isFinite(valueMs)) return "無法取得";
  return `${Math.floor(valueMs / 60000)} 分 ${((valueMs % 60000) / 1000).toFixed(3)} 秒`;
}
function ratio(value, total) {
  return Number.isFinite(value) && Number.isFinite(total) && total > 0
    ? `${Math.round(value / total * 1000) / 10}%` : "無法取得";
}
function metric(value) {
  return Number.isFinite(value?.percent)
    ? `${value.percent}%（${value.covered}/${value.total}）` : "不適用";
}
function unique(values) { return [...new Set(values.filter(available))]; }
function list(values, empty = "無") {
  return Array.isArray(values) && values.length > 0 ? values.join("、") : empty;
}
function semanticText(value) {
  if (!available(value)) return null;
  if (typeof value !== "object") return String(value);
  for (const field of ["description", "reason", "action", "behavior", "evidence", "detail", "message", "id"]) {
    if (available(value[field])) return String(value[field]);
  }
  const scalarValues = Object.values(value)
    .filter((item) => available(item) && typeof item !== "object")
    .map(String);
  return scalarValues.length > 0 ? scalarValues.join("；") : JSON.stringify(value);
}
function semanticList(value) {
  const values = Array.isArray(value) ? value : available(value) ? [value] : [];
  return unique(values.map(semanticText));
}
function sentence(value) {
  const text = String(value).trim();
  return /[。！？!?]$/u.test(text) ? text : `${text}。`;
}
function sentenceList(values, empty = "無") {
  return Array.isArray(values) && values.length > 0
    ? values.map(sentence).join("<br>")
    : sentence(empty);
}
function detailLines(labelText, values, empty) {
  const items = Array.isArray(values) ? values.filter(available) : [];
  if (items.length <= 1) {
    return [`- ${labelText}：${sentence(items[0] ?? empty)}`];
  }
  return [
    `- ${labelText}：`,
    ...items.map((item, index) => `  ${index + 1}. ${sentence(item)}`),
  ];
}
function decisionReason(evidence) {
  if (!evidence || typeof evidence !== "object") return null;
  return evidence.reason ?? evidence.blockingReason ?? evidence.rationale ?? evidence.description ?? null;
}
function candidateBehaviorText(value) {
  if (!value || typeof value !== "object") return semanticText(value);
  const behavior = value.behavior ?? value.description ?? value.id;
  const reason = value.reason ?? value.disposition;
  if (available(behavior) && available(reason)) return `${behavior}：${reason}`;
  return semanticText(value);
}
function phaseKey(role, mode) { return `${role}:${mode}`; }
function contractKey(role, mode) {
  if (role === "author") return mode === "repair" ? "authorRepair" : "authorInitial";
  return mode === "final" ? "verifierFinal" : "verifierInitial";
}

function testClassNames(testFiles) {
  return unique((testFiles ?? []).flatMap((filePath) => {
    if (!fs.existsSync(filePath)) return [];
    const source = fs.readFileSync(filePath, "utf8");
    const namespaceName = source.match(/\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*[;{]/u)?.[1];
    return [...source.matchAll(/\bpublic\s+(?:(?:sealed|static|abstract|partial)\s+)*class\s+([A-Za-z_][A-Za-z0-9_]*)/gu)]
      .map((match) => namespaceName ? `${namespaceName}.${match[1]}` : match[1]);
  }));
}

function noTestDecision(decision) {
  return decision === "blocked" || decision === "not_suitable";
}

function effectiveAuthor(artifacts, repairUsed) {
  const initial = artifacts.authorInitial ?? {};
  const repair = artifacts.authorRepair ?? {};
  if (!repairUsed) return artifacts.author ?? initial;
  return {
    ...initial,
    ...repair,
    testFilePaths: repair.testFilePaths ?? initial.testFilePaths ?? [],
    scenarioPlan: repair.scenarioPlan ?? initial.scenarioPlan ?? [],
    scenarioCoverage: repair.scenarioCoverage ?? initial.scenarioCoverage ?? [],
    contractInventory: repair.contractInventory ?? initial.contractInventory ?? [],
    completenessAudit: repair.completenessAudit ?? initial.completenessAudit ?? null,
    excludedResponsibilities: repair.excludedResponsibilities
      ?? initial.excludedResponsibilities ?? [],
  };
}

function authorTestMethodCount(author) {
  const names = new Set();
  for (const file of author?.testFilePaths ?? []) {
    if (!fs.existsSync(file)) continue;
    for (const method of collectTestMethods(fs.readFileSync(file, "utf8"))) names.add(method.name);
  }
  return names.size > 0 ? names.size : null;
}

function targetTestCounts(verification, author, terminalDecision) {
  if (noTestDecision(terminalDecision)) {
    return {
      status: "not_applicable",
      reason: terminalDecision === "blocked"
        ? "Verifier 確認需先新增 production seam，依契約不執行 xUnit"
        : "Verifier 確認沒有具公開 Oracle 的 valuable scenario，依契約不執行 xUnit",
      total: 0, passed: 0, failed: 0, skipped: 0,
    };
  }
  const trxPath = verification.test?.trxPath;
  if (!trxPath || !fs.existsSync(trxPath)) {
    return { status: "unavailable", reason: "Verifier 未提供可讀 TRX，無法取得 target-scoped xUnit cases" };
  }
  const classes = testClassNames(author?.testFilePaths);
  if (classes.length === 0) {
    return { status: "unavailable", reason: "Author 測試檔無法解析出 public test class" };
  }
  const cases = parseTrxTestResults(fs.readFileSync(trxPath, "utf8"))
    .filter((item) => classes.some((name) => item.testName?.startsWith(`${name}.`)));
  const count = (outcome) => cases.filter((item) => item.outcome?.toLowerCase() === outcome).length;
  return {
    status: "available", testClasses: classes, total: cases.length,
    passed: count("passed"), failed: count("failed"),
    skipped: count("notexecuted") + count("skipped"),
  };
}

function coveredMethods(author) {
  return unique((author?.scenarioPlan ?? []).map((scenario) => scenario.testMethod?.split("_")[0]));
}

function scenarioCategories(author) {
  const groups = new Map();
  for (const scenario of author?.scenarioPlan ?? []) {
    const key = scenario.category ?? "other";
    if (!groups.has(key)) groups.set(key, { category: key, scenarios: [] });
    groups.get(key).scenarios.push({
      id: scenario.id, behavior: scenario.expectedBehavior, rule: scenario.coveredRule,
      oracle: scenario.oracle, priority: scenario.priority,
    });
  }
  return [...groups.values()];
}

function userScenarioResult(author, userScenarios) {
  const coverage = new Map((author?.scenarioCoverage ?? []).map((item) => [item.id, item]));
  return (userScenarios?.scenarios ?? []).map((scenario) => ({
    id: scenario.id, text: scenario.text,
    status: coverage.get(scenario.id)?.status ?? "unavailable",
    testMethod: coverage.get(scenario.id)?.testMethod ?? null,
    reason: coverage.get(scenario.id)?.reason ?? null,
  }));
}

function observationEvidence(manifest) {
  const reads = [];
  const missing = [];
  for (const phase of manifest.phases ?? []) {
    if (!phase.observationPath || !fs.existsSync(phase.observationPath)) {
      missing.push(`${phaseKey(phase.role, phase.mode)} 缺少 phase observation`);
      continue;
    }
    const observation = JSON.parse(fs.readFileSync(phase.observationPath, "utf8"));
    for (const skill of observation.skillReads ?? []) {
      reads.push({
        phase: phaseKey(phase.role, phase.mode), name: skill.name,
        purpose: skill.description, path: skill.path, evidencePath: phase.observationPath,
      });
    }
  }
  const deduplicated = [];
  const keys = new Set();
  for (const item of reads) {
    const key = `${item.phase}:${item.name}:${item.path}`;
    if (!keys.has(key)) { keys.add(key); deduplicated.push(item); }
  }
  return {
    status: missing.length === 0 ? "complete" : deduplicated.length > 0 ? "partial" : "unavailable",
    reason: missing.length === 0 ? null : missing.join("；"), reads: deduplicated,
  };
}

function intervalUnionMs(intervals) {
  const sorted = intervals
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((left, right) => left[0] - right[0]);
  if (sorted.length === 0) return 0;
  let total = 0;
  let [currentStart, currentEnd] = sorted[0];
  for (const [start, end] of sorted.slice(1)) {
    if (start <= currentEnd) currentEnd = Math.max(currentEnd, end);
    else {
      total += currentEnd - currentStart;
      [currentStart, currentEnd] = [start, end];
    }
  }
  return total + currentEnd - currentStart;
}

function phasePurposeFor(manifest, phase) {
  const key = phaseKey(phase.role, phase.mode);
  if (manifest.terminalDecision === "blocked") {
    if (key === "author:initial") return "分析公開行為與三類隔離 seam，記錄阻擋證據與重構方向";
    if (key === "verifier:initial") return "獨立複核三類 seam 與 production integrity；依契約不執行 Build、test、coverage";
  }
  if (manifest.terminalDecision === "not_suitable") {
    if (key === "author:initial") return "盤點公開行為與 Oracle，確認沒有 valuable test scenario";
    if (key === "verifier:initial") return "獨立複核測試價值與 production integrity；依契約不執行 Build、test、coverage";
  }
  return phasePurpose[key] ?? "階段工作";
}

function timingEvidence(manifest) {
  const phases = (manifest.phases ?? []).map((phase) => {
    const status = phase.status
      ?? (phase.resultStatus === "environment_blocked" ? "stopped" : "completed");
    const stopped = status === "stopped";
    return {
      role: phase.role, mode: phase.mode, status,
      label: phaseLabels[phaseKey(phase.role, phase.mode)] ?? phaseKey(phase.role, phase.mode),
      purpose: phasePurposeFor(manifest, phase),
      dispatchIssuedAt: phase.dispatchIssuedAt ?? phase.startedAt ?? null,
      dispatchIssuedAtEpochMs: phase.dispatchIssuedAtEpochMs ?? phase.startedAtEpochMs ?? null,
      dispatchAcceptedAt: phase.dispatchAcceptedAt ?? null,
      dispatchAcceptedAtEpochMs: phase.dispatchAcceptedAtEpochMs ?? null,
      dispatchAcceptedUnavailableReason: phase.dispatchAcceptedUnavailableReason ?? null,
      artifactReadyAt: phase.artifactReadyAt ?? null,
      artifactReadyAtEpochMs: phase.artifactReadyAtEpochMs ?? null,
      completedAt: stopped ? null : phase.completedAt ?? phase.finishedAt ?? null,
      completedAtEpochMs: stopped ? null : phase.completedAtEpochMs ?? phase.finishedAtEpochMs ?? null,
      stoppedAt: stopped ? phase.stoppedAt ?? phase.finishedAt ?? null : null,
      stoppedAtEpochMs: stopped ? phase.stoppedAtEpochMs ?? phase.finishedAtEpochMs ?? null : null,
      finishedAt: phase.finishedAt ?? phase.completedAt ?? phase.stoppedAt ?? null,
      finishedAtEpochMs: phase.finishedAtEpochMs
        ?? phase.completedAtEpochMs ?? phase.stoppedAtEpochMs ?? null,
      durationMs: phase.durationMs ?? null,
      dispatchLatencyMs: Number.isFinite(phase.dispatchAcceptedAtEpochMs) && Number.isFinite(phase.dispatchIssuedAtEpochMs)
        ? Math.max(0, phase.dispatchAcceptedAtEpochMs - phase.dispatchIssuedAtEpochMs) : null,
      agentProduceMs: Number.isFinite(phase.artifactReadyAtEpochMs) && Number.isFinite(phase.dispatchAcceptedAtEpochMs)
        ? Math.max(0, phase.artifactReadyAtEpochMs - phase.dispatchAcceptedAtEpochMs) : null,
      driverValidationMs: phase.driverValidationMs ?? null,
    };
  });
  const phaseTotalMs = phases.reduce((sum, phase) => sum + (Number.isFinite(phase.durationMs) ? phase.durationMs : 0), 0);
  const workflowTotalMs = manifest.durationMs ?? null;
  const longest = [...phases].filter((phase) => Number.isFinite(phase.durationMs))
    .sort((left, right) => right.durationMs - left.durationMs)[0] ?? null;
  const produceComplete = phases.length > 0 && phases.every((phase) => Number.isFinite(phase.agentProduceMs));
  const produceUnionMs = produceComplete ? intervalUnionMs(phases.map((phase) => [
    phase.dispatchAcceptedAtEpochMs, phase.artifactReadyAtEpochMs,
  ])) : null;
  return {
    phases, phaseTotalMs, workflowTotalMs,
    longestPhase: longest?.label ?? null, longestPhaseMs: longest?.durationMs ?? null,
    observableCoordinationAndValidationMs: produceComplete
      ? Math.max(0, workflowTotalMs - produceUnionMs) : null,
    observableCoordinationUnavailableReason: produceComplete ? null
      : "Codex runtime 未提供 dispatchAcceptedAt，無法把 agent produce 與協調／驗證時間可靠拆分",
    timingSource: manifest.manifestPath,
  };
}

function tokenEvidence(token, manifest) {
  const runtimeComplete = token.runtime?.phaseObservationComplete === true;
  const workflowUpperBound = token.workflowEstimatedTokenUpperBound
    ?? token.workflowObservedEstimatedTokens ?? null;
  const runtimeUpperBound = token.runtime?.runtimeTextUpperBoundEstimatedTokens
    ?? token.runtime?.observedEstimatedTokens ?? null;
  const runtimeByPhase = new Map();
  for (const item of token.runtime?.observations ?? []) {
    if (!item.phase || !item.mode) continue;
    const key = phaseKey(item.phase, item.mode);
    runtimeByPhase.set(key, (runtimeByPhase.get(key) ?? 0) + (item.estimatedTokens ?? 0));
  }
  const rows = [{
    key: "orchestrator", label: phaseLabels.orchestrator,
    fixedContractEstimatedTokens: token.phaseContracts?.orchestrator?.estimatedTokens ?? null,
    runtimeTextUpperBoundEstimatedTokens: null, observationStatus: "not_applicable",
    observationReason: "Driver 無法觀察 Main 對話層的 runtime 文字",
  }];
  for (const phase of manifest.phases ?? []) {
    const key = phaseKey(phase.role, phase.mode);
    rows.push({
      key, label: phaseLabels[key] ?? key,
      fixedContractEstimatedTokens: token.phaseContracts?.[contractKey(phase.role, phase.mode)]?.estimatedTokens ?? null,
      runtimeTextUpperBoundEstimatedTokens: runtimeComplete ? runtimeByPhase.get(key) ?? 0 : null,
      observationStatus: runtimeComplete ? "complete" : "unavailable",
      observationReason: runtimeComplete ? null : "phase observations 不完整",
    });
  }
  for (const row of rows) {
    row.totalEstimatedTokens = Number.isFinite(row.fixedContractEstimatedTokens) &&
        (Number.isFinite(row.runtimeTextUpperBoundEstimatedTokens) || row.key === "orchestrator")
      ? row.fixedContractEstimatedTokens + (row.runtimeTextUpperBoundEstimatedTokens ?? 0) : null;
    row.sharePercent = Number.isFinite(row.totalEstimatedTokens) &&
        Number.isFinite(workflowUpperBound) && workflowUpperBound > 0
      ? Math.round(row.totalEstimatedTokens / workflowUpperBound * 1000) / 10 : null;
  }
  const repairIncrementEstimatedTokens = rows
    .filter((row) => row.key === "author:repair" || row.key === "verifier:final")
    .reduce((sum, row) => sum + (row.totalEstimatedTokens ?? 0), 0);
  return {
    estimateKind: token.estimateKind ?? "unavailable", phases: rows,
    fixedContractEstimatedTokens: token.executedStaticWorkflowEstimatedTokens ?? token.staticWorkflowEstimatedTokens ?? null,
    runtimeTextUpperBoundEstimatedTokens: runtimeUpperBound,
    workflowEstimatedTokenUpperBound: workflowUpperBound,
    repairIncrementEstimatedTokens: manifest.repairUsed && rows
      .filter((row) => row.key === "author:repair" || row.key === "verifier:final")
      .every((row) => Number.isFinite(row.totalEstimatedTokens))
      ? repairIncrementEstimatedTokens : manifest.repairUsed ? null : 0,
    phaseObservationComplete: runtimeComplete,
    telemetryWarnings: token.runtime?.telemetryWarnings ?? [],
    providerActual: { status: "unavailable", reason: "Provider 未提供實際 token usage" },
    comparison: { status: "unavailable", reason: "本輪沒有 estimator identity、fixture 與 environment 均相容的配對基線" },
  };
}

function repairEvidence(manifest, artifacts, authorPhases, verifierPhases) {
  const repair = artifacts.repair ?? {};
  const coverageGaps = repair.coverageGaps ?? [];
  const qualityGaps = repair.qualityGaps ?? [];
  const deliveryGaps = repair.testDeliveryGap ? [repair.testDeliveryGap] : [];
  const gaps = [...coverageGaps, ...qualityGaps, ...deliveryGaps];
  const initialRepairable = new Map(
    (artifacts.initialVerification?.coverageDecision?.repairable ?? [])
      .filter((item) => available(item?.id))
      .map((item) => [item.id, item]),
  );
  const explicitEligibility = artifacts.initialVerification?.repairEligibility ?? null;
  const derivedScope = coverageGaps.length > 0 && qualityGaps.length > 0
    ? "coverage-and-quality"
    : coverageGaps.length > 0 ? "coverage"
      : qualityGaps.length > 0 ? "quality"
        : deliveryGaps.length > 0 ? "test-delivery" : null;
  const eligibility = explicitEligibility ?? (
    manifest.repairUsed === true
      && artifacts.initialVerification?.coverageDecision?.status === "needs_repair"
      && available(derivedScope)
      ? {
          status: "eligible",
          scope: derivedScope,
          reason: "Verifier 初次驗證判定存在可修正缺口，driver 已核准唯一一次 repair。",
          source: "coverageDecision-and-repair-manifest",
        }
      : null
  );
  const triggers = [
    ...coverageGaps.map((item) => item.reason ?? initialRepairable.get(item.id)?.reason ?? item.id),
    ...qualityGaps.map((item) => item.reason ?? item.id),
    ...deliveryGaps.map((item) => item.reason ?? item.kind),
  ];
  const actions = [
    ...coverageGaps.map((item) => item.action),
    ...qualityGaps.map((item) => item.action),
    ...deliveryGaps.map((item) => item.action),
  ];
  const writtenFiles = unique((artifacts.author?.tokenEstimateInputs?.writtenFiles ?? [])
    .map((item) => typeof item === "string" ? item : item?.path));
  const isWorkflowEvidence = (filePath) => /(^|[\\/])\.orchestrator([\\/]|$)/u.test(filePath);
  return {
    used: manifest.repairUsed === true, rounds: manifest.repairUsed === true ? 1 : 0,
    triggerReasons: unique(triggers),
    actions: unique(actions),
    eligibility,
    budget: { allowed: 1, used: manifest.repairUsed === true ? 1 : 0 },
    changedFiles: manifest.repairUsed ? writtenFiles.filter((filePath) => !isWorkflowEvidence(filePath)) : [],
    evidenceFiles: manifest.repairUsed ? writtenFiles.filter(isWorkflowEvidence) : [],
    authorRepairStatus: authorPhases.find((phase) => phase.mode === "repair")?.resultStatus ?? "not_observed",
    verifierFinalStatus: verifierPhases.find((phase) => phase.mode === "final")?.resultStatus ?? "not_observed",
  };
}

function artifactInventory(runRoot) {
  if (!runRoot || !fs.existsSync(runRoot)) return [];
  const output = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) output.push(entryPath);
    }
  };
  visit(runRoot);
  return output.sort((left, right) => left.localeCompare(right));
}

function phaseArtifact(manifest, artifacts, phase) {
  const key = phaseKey(phase.role, phase.mode);
  if (key === "author:initial") {
    return artifacts.authorInitial ?? (!manifest.repairUsed ? artifacts.author : null);
  }
  if (key === "author:repair") return artifacts.authorRepair ?? artifacts.author;
  if (key === "verifier:initial") {
    return artifacts.verificationInitial ?? artifacts.initialVerification
      ?? (!manifest.repairUsed ? artifacts.verification : null);
  }
  if (key === "verifier:final") return artifacts.verificationFinal ?? artifacts.verification;
  return null;
}

function incidentIdentity(item, workflowPhase) {
  return `${workflowPhase}:${JSON.stringify([
    item.kind, item.phase, item.stage, item.impact, item.description, item.detail,
    item.message, item.error, item.evidence, item.evidencePath, item.path,
    item.disposition, item.resolved,
  ])}`;
}

function runnerIncidentEvidence(item, verification) {
  const counts = verification?.test?.counts;
  const line = verification?.coverage?.line;
  const branch = verification?.coverage?.branch;
  const evidence = [
    counts ? `${counts.passed}/${counts.total} tests 通過` : null,
    Number.isFinite(line?.covered) ? `Line ${line.covered}/${line.total}` : null,
    Number.isFinite(branch?.covered) ? `Branch ${branch.covered}/${branch.total}` : null,
    verification?.test?.trxPath ? `TRX：${verification.test.trxPath}` : null,
    verification?.coverage?.reportPath ? `Coverage：${verification.coverage.reportPath}` : null,
    Number.isFinite(item.exitCode) ? `exit code ${item.exitCode}` : null,
  ].filter(available).join("；");
  return {
    ...item,
    source: "runner",
    phase: item.phase ?? item.stage ?? "runner",
    impact: item.impact ?? item.description ?? item.detail
      ?? "Runner 在收集machine evidence時回報非預期狀態。",
    evidence: item.evidence ?? (evidence || "Runner已保留可取得的machine evidence。"),
    disposition: item.disposition ?? "保留machine evidence，並將runner狀態列為工具異常。",
  };
}

function collectWorkflowIncidents(manifest, artifacts) {
  const collected = (manifest.workflowIncidents ?? []).map((item) => ({
    item, workflowPhase: "orchestrator", verification: null, runner: false,
  }));
  for (const phase of manifest.phases ?? []) {
    const artifact = phaseArtifact(manifest, artifacts, phase);
    if (!artifact) continue;
    const workflowPhase = phaseKey(phase.role, phase.mode);
    const runnerIncidents = phase.role === "verifier" && Array.isArray(artifact.runnerIncidents)
      ? artifact.runnerIncidents : [];
    for (const item of artifact.phaseIncidents ?? []) {
      collected.push({ item, workflowPhase, verification: phase.role === "verifier" ? artifact : null, runner: false });
    }
    if (phase.role === "verifier") {
      for (const item of runnerIncidents) {
        collected.push({ item, workflowPhase, verification: artifact, runner: true });
      }
    }
  }
  const uniqueIncidents = new Map();
  for (const entry of collected) {
    const identity = incidentIdentity(entry.item, entry.workflowPhase);
    if (!uniqueIncidents.has(identity)) uniqueIncidents.set(identity, entry);
  }
  return [...uniqueIncidents.values()].map(({ item, verification, workflowPhase, runner }) => ({
    item: runner ? runnerIncidentEvidence(item, verification) : item,
    workflowPhase,
  }));
}

function incidentEvidence(items) {
  return items.map(({ item, workflowPhase }) => {
    const contextPhase = phaseLabels[workflowPhase] ?? workflowPhase;
    const localStage = item.phase ?? item.stage;
    return {
      kind: item.kind ?? "incident",
      kindLabel: incidentKindLabels[item.kind]
        ?? (item.source === "runner" ? "Runner 工具異常" : "其他執行異常"),
      phase: localStage && localStage !== contextPhase
        ? `${contextPhase}／${localStage}`
        : contextPhase,
      impact: item.impact ?? item.description ?? item.detail ?? item.message ?? item.error
        ?? "未提供影響說明",
      evidence: item.evidence ?? item.evidencePath ?? item.path ?? "無法取得",
      disposition: item.disposition ?? (item.resolved === true
        ? "事件已在本階段恢復；保留原始證據。"
        : "依 terminal decision 與保留證據判讀"),
      message: item.message ?? null,
    };
  });
}

export function buildWorkflowResult(manifest, artifacts = {}) {
  const authorPhases = manifest.phases.filter((phase) => phase.role === "author");
  const verifierPhases = manifest.phases.filter((phase) => phase.role === "verifier");
  const author = effectiveAuthor(artifacts, manifest.repairUsed);
  const verification = artifacts.verification ?? {};
  const testCounts = verification.test?.counts ?? null;
  const targetCounts = targetTestCounts(verification, author, manifest.terminalDecision);
  const workflowIncidents = incidentEvidence(collectWorkflowIncidents(manifest, artifacts));
  const authorDecisionEvidence = author.decisionEvidence ?? null;
  const verifierDecisionEvidence = manifest.terminalDecision === "blocked"
    ? verification.blockerReview ?? verification.decisionEvidence ?? null
    : manifest.terminalDecision === "not_suitable"
      ? verification.notSuitableReview ?? verification.decisionEvidence ?? null
      : verification.decisionEvidence ?? null;
  return {
    schemaVersion: 2, reportContractVersion: 1,
    identity: {
      runId: manifest.runId, target: manifest.targetClass,
      targetSourcePath: manifest.targetSourcePath, testProjectPath: manifest.testProjectPath,
    },
    outcome: {
      lifecycleStatus: manifest.lifecycleStatus, terminalDecision: manifest.terminalDecision,
      stopReason: manifest.stopReason, deliveryStatus: manifest.deliveryStatus,
      qualityStatus: manifest.qualityStatus, coverageStatus: manifest.coverageStatus,
    },
    author: {
      status: authorPhases.at(-1)?.resultStatus ?? "not_run", testFiles: author.testFilePaths ?? [],
      coveredMethods: coveredMethods(author), testMethods: authorTestMethodCount(author),
      scenarioCount: Array.isArray(author.scenarioPlan) ? author.scenarioPlan.length : null,
      targetSpecificCases: Number.isFinite(targetCounts.total) ? targetCounts.total : null,
      targetSpecificCaseEvidence: targetCounts, fixRounds: author.fixRounds ?? null,
    },
    verifier: {
      status: verifierPhases.at(-1)?.resultStatus ?? "not_run",
      build: verification.build?.status ?? "not_run", test: verification.test?.status ?? "not_run",
      projectTestCounts: testCounts, projectTests: testCounts?.total ?? null,
      projectPassed: testCounts?.passed ?? null,
      lineCoverage: verification.coverage?.line ?? null, branchCoverage: verification.coverage?.branch ?? null,
      quality: verification.quality ?? { status: "not_applicable", issues: [] },
      qualityScore: verification.qualityScore ?? null,
      missingTestCases: verification.coverageDecision?.repairable ?? [],
      remainingUncovered: verification.coverageDecision?.uncoverable ?? [],
    },
    decisionReview: {
      kind: manifest.terminalDecision,
      reason: verification.coverageDecision?.reason
        ?? decisionReason(verifierDecisionEvidence)
        ?? decisionReason(authorDecisionEvidence)
        ?? null,
      authorEvidence: authorDecisionEvidence,
      verifierEvidence: verifierDecisionEvidence,
      blocker: manifest.terminalDecision === "blocked"
        ? verifierDecisionEvidence ?? authorDecisionEvidence
        : null,
      notSuitable: manifest.terminalDecision === "not_suitable"
        ? verifierDecisionEvidence ?? authorDecisionEvidence
        : null,
    },
    testScope: {
      categories: scenarioCategories(author), contractInventory: author.contractInventory ?? [],
      completenessAudit: author.completenessAudit ?? null,
      excludedResponsibilities: author.excludedResponsibilities
        ?? author.completenessAudit?.excludedResponsibilities ?? [],
      userScenarios: userScenarioResult(author, artifacts.userScenarios),
    },
    technicalSources: observationEvidence(manifest),
    repair: repairEvidence(manifest, artifacts, authorPhases, verifierPhases),
    integrity: {
      production: artifacts.productionIntegrity ?? "unavailable",
      verifierTestDelivery: artifacts.testIntegrity ?? "unavailable",
    },
    timing: timingEvidence(manifest),
    estimatedTokenUsage: tokenEvidence(artifacts.tokenEstimate ?? {}, manifest),
    warnings: {
      build: verification.build?.warnings ?? { count: null, codes: [], lines: [] },
      workflowIncidents, telemetry: artifacts.tokenEstimate?.runtime?.telemetryWarnings ?? [],
    },
    retainedArtifacts: {
      runRoot: manifest.runRoot, manifestPath: manifest.manifestPath,
      resultPath: manifest.paths?.result, resultMarkdownPath: manifest.paths?.resultMarkdown,
      authorResultPath: authorPhases.at(-1)?.artifactPath,
      verificationResultPath: verifierPhases.at(-1)?.artifactPath,
      tokenEstimatePath: manifest.paths?.tokenEstimate, testProjectPath: manifest.testProjectPath,
      testFiles: author.testFilePaths ?? [],
      inventory: unique([
        ...artifactInventory(manifest.runRoot), manifest.paths?.result, manifest.paths?.resultMarkdown,
      ]),
    },
  };
}

function projectTestText(counts) {
  return counts ? `${counts.total} 個：${counts.passed} 通過、${counts.failed} 失敗、${counts.skipped} 略過` : "無法取得";
}
function outcomeConclusion(result) {
  const production = result.integrity.production === "passed" ? "Production 程式碼未修改" : "Production 完整性未通過";
  if (result.outcome.terminalDecision === "blocked") {
    return `整體結果：${label(result.outcome.terminalDecision)}。可測性分析與獨立複核已完成；target 必須先新增 production seam 才能建立隔離的 Unit Tests，這不是 workflow failure。${production}。`;
  }
  if (result.outcome.terminalDecision === "not_suitable") {
    return `整體結果：${label(result.outcome.terminalDecision)}。Author 與 Verifier 已確認目前沒有具公開 Oracle 的 valuable Unit Test scenario，這不是 workflow failure。${production}。`;
  }
  const blocker = result.outcome.stopReason ? `停止原因：${label(result.outcome.stopReason, result.outcome.stopReason)}` : "沒有阻擋交付的停止原因";
  return `整體結果：${label(result.outcome.terminalDecision)}。${production}；${blocker}。`;
}
function renderSummary(result) {
  const noTest = noTestDecision(result.outcome.terminalDecision);
  const score = result.verifier.qualityScore?.total;
  const targetCases = Number.isFinite(result.author.targetSpecificCases)
    ? `${result.author.targetSpecificCases} 個 target cases`
    : `Target cases 無法取得（${result.author.targetSpecificCaseEvidence.reason}）`;
  const buildTest = noTest
    ? `未執行（依 ${result.outcome.terminalDecision} 契約）`
    : `${label(result.verifier.build)}／${label(result.verifier.test)}`;
  const coverage = noTest
    ? "Line／Branch 不適用"
    : `Line ${metric(result.verifier.lineCoverage)}；Branch ${metric(result.verifier.branchCoverage)}`;
  return [
    ...table(["項目", "結果"], [
      ["Target", code(result.identity.target)],
      ["Build／Test", buildTest],
      ["測試", noTest ? "未建立" : `${targetCases}；共用專案 ${projectTestText(result.verifier.projectTestCounts)}`],
      ["Coverage", coverage],
      ["品質", noTest ? "不適用" : `${label(result.outcome.qualityStatus)}${Number.isFinite(score) ? `（${score}/100）` : ""}`],
      ["最終判定", label(result.outcome.terminalDecision)],
    ]), "", outcomeConclusion(result),
  ];
}
function renderTestContent(result) {
  const noTest = noTestDecision(result.outcome.terminalDecision);
  if (noTest) return [`本輪依 ${result.outcome.terminalDecision} 契約未建立測試；分析結果見下一節。`];
  const categories = result.testScope.categories.map((group) =>
    `${categoryLabels[group.category] ?? group.category} ${group.scenarios.length} 項`);
  const output = [
    `涵蓋類型：${list(categories, "無法取得")}。`,
    `受測方法：${list(result.author.coveredMethods.map(code), "無法取得")}。`,
    `測試方法／設計情境／Target cases：${result.author.testMethods ?? "無法取得"}／${result.author.scenarioCount ?? "無法取得"}／${result.author.targetSpecificCases ?? "無法取得"}。`,
    `測試檔案：${list(result.author.testFiles.map((item) => code(path.basename(item))), "無")}。`,
  ];
  if (result.testScope.userScenarios.length > 0) output.push("", ...table(
    ["使用者情境", "結果", "對應測試／理由"], result.testScope.userScenarios.map((item) => [
      item.text, label(item.status, item.status), available(item.testMethod) ? code(item.testMethod) : item.reason ?? "無法取得",
    ]),
  ));
  return output;
}
function noRepairReason(result) {
  if (result.outcome.terminalDecision === "blocked") return "可測性複核要求先重構，依契約不進 repair";
  if (result.outcome.terminalDecision === "not_suitable") return "確認沒有 valuable scenario，依契約不進 repair";
  if (["pass", "best_effort"].includes(result.outcome.terminalDecision)) return "初次驗證已完成";
  return "流程終止，未授權 repair";
}
function renderTiming(result) {
  const rows = result.timing.phases.map((phase) => [phase.label, duration(phase.durationMs),
    ratio(phase.durationMs, result.timing.workflowTotalMs), phase.purpose]);
  rows.push(["Workflow 總計", duration(result.timing.workflowTotalMs), "100%", "Driver 記錄的完整 workflow 區間"]);
  const interpretation = result.timing.longestPhase
    ? `主要耗時階段為「${result.timing.longestPhase}」，耗時 ${duration(result.timing.longestPhaseMs)}，占 workflow ${ratio(result.timing.longestPhaseMs, result.timing.workflowTotalMs)}。`
    : "本輪沒有足夠 phase timing 可判讀主要耗時。";
  return [
    ...table(["階段", "耗時", "占比", "工作內容"], rows), "",
    `證據來源：${code(result.timing.timingSource)}。`,
    result.timing.observableCoordinationAndValidationMs === null
      ? `協調與驗證時間：無法可靠拆分；${result.timing.observableCoordinationUnavailableReason}。`
      : `可觀測協調與驗證時間：${duration(result.timing.observableCoordinationAndValidationMs)}。`,
    interpretation,
  ];
}
function tokenNumber(value) { return Number.isFinite(value) ? value.toLocaleString("en-US") : "無法取得"; }
function renderTokens(result) {
  const token = result.estimatedTokenUsage;
  const rows = token.phases.map((phase) => [
    phase.label, tokenNumber(phase.fixedContractEstimatedTokens),
    phase.observationStatus === "not_applicable" ? "不適用" : tokenNumber(phase.runtimeTextUpperBoundEstimatedTokens),
    tokenNumber(phase.totalEstimatedTokens), Number.isFinite(phase.sharePercent) ? `${phase.sharePercent}%` : "無法取得",
  ]);
  rows.push(["總計", tokenNumber(token.fixedContractEstimatedTokens), tokenNumber(token.runtimeTextUpperBoundEstimatedTokens),
    tokenNumber(token.workflowEstimatedTokenUpperBound), "100%"]);
  const largest = [...token.phases].filter((phase) => Number.isFinite(phase.totalEstimatedTokens) && Number.isFinite(phase.sharePercent))
    .sort((left, right) => right.totalEstimatedTokens - left.totalEstimatedTokens)[0];
  return [
    ...table(["階段", "固定契約", "申報檔案上限", "合計上限", "占比"], rows), "",
    `估算方式：${code(token.estimateKind)}。${largest ? `上限估算最高的是「${largest.label}」（${largest.sharePercent}%）` : "沒有足夠資料判斷最高階段"}。`,
    result.repair.used
      ? `Repair 增量估算：${tokenNumber(token.repairIncrementEstimatedTokens)} tokens（Author repair 與 Verifier final 合計）。`
      : "本輪未使用 repair，repair 增量為 0。",
    `申報檔案以完整檔案大小計算；局部讀取也會高估，不能解讀為實際可見 token。${token.providerActual.reason}，亦不含 hidden framing、internal reasoning與cache accounting。`,
    ...(token.phaseObservationComplete ? [] : ["Phase observation清單不完整，因此runtime與workflow上限無法可靠計算。"]),
    `${token.comparison.reason}，不能據此宣稱版本間增減。`,
  ];
}
function warningText(value) {
  if (!value || !Number.isFinite(value.count)) return "無法取得";
  return value.count === 0 ? "無" : `${value.count} 項：${list(value.lines?.length ? value.lines : value.codes)}`;
}
function renderDelivery(result) {
  const noTest = noTestDecision(result.outcome.terminalDecision);
  const output = [
    `- Workflow repair：${result.repair.used ? `使用 ${result.repair.rounds}/${result.repair.budget.allowed} 輪` : `未使用；${noRepairReason(result)}`}。`,
    `- Production source：${result.integrity.production === "passed" ? "未修改" : label(result.integrity.production)}。`,
    `- Verifier test integrity：${label(result.integrity.verifierTestDelivery)}。`,
    `- Build warnings：${noTest ? "不適用" : warningText(result.warnings.build)}。`,
    `- 執行異常：${result.warnings.workflowIncidents.length === 0 ? "無" : `${result.warnings.workflowIncidents.length} 項`}。`,
  ];
  if (result.repair.used) output.push(
    ...detailLines("修正原因", result.repair.triggerReasons, "Verifier 要求修正"),
    ...detailLines("修正內容", result.repair.actions, "Author artifact 未提供修正動作"),
    `- 修正檔案：${list(result.repair.changedFiles.map(code), "未提供")}；最終驗證：${label(result.repair.verifierFinalStatus)}。`,
  );
  const issues = result.verifier.quality?.issues ?? [];
  if (issues.length > 0) output.push(`- 品質問題：${sentenceList(semanticList(issues))}`);
  if (result.verifier.remainingUncovered.length > 0) {
    output.push(`- 未覆蓋項目：${sentenceList(semanticList(result.verifier.remainingUncovered))}`);
  }
  if (result.outcome.terminalDecision === "blocked") {
    const review = result.decisionReview.blocker;
    const authorReview = result.decisionReview.authorEvidence;
    const seams = review?.seamAudit ?? authorReview?.seamAudit ?? null;
    const publicBehaviors = unique([
      ...semanticList(review?.publicEntry),
      ...semanticList(review?.observableBehavior),
      ...semanticList(review?.publicBehaviors),
      ...semanticList(authorReview?.candidateBehaviors),
      ...semanticList(authorReview?.publicBehaviors),
    ]);
    const blockingEvidence = unique([
      ...semanticList(review?.blockingEvidence),
      ...semanticList(review?.checkedSeams),
      ...semanticList(authorReview?.blockingEvidence),
      ...semanticList(authorReview?.checkedSeams),
    ]);
    const recommendations = unique([
      ...semanticList(review?.recommendations),
      ...semanticList(review?.recommendedRefactoring),
      ...semanticList(review?.repairAssessment),
      ...semanticList(authorReview?.recommendations),
      ...semanticList(authorReview?.recommendedRefactoring),
      ...semanticList(authorReview?.repairAssessment),
    ]);
    output.push(`- 阻擋原因：${sentence(result.decisionReview.reason ?? "target 需先新增 production seam")}`);
    if (publicBehaviors.length > 0) output.push(...detailLines("公開行為", publicBehaviors, "無法取得"));
    if (seams) output.push(...table(["Seam", "證據"], [
        ["Constructor injection", seams.constructorInjection?.evidence ?? "無法取得"],
        ["Abstraction overload", seams.abstractionOverload?.evidence ?? "無法取得"],
        ["Virtual／protected hook", seams.overridableHook?.evidence ?? "無法取得"],
      ]));
    else if (blockingEvidence.length > 0) {
      output.push(...detailLines("阻擋證據", blockingEvidence, "無法取得"));
    }
    if (recommendations.length > 0) output.push(...detailLines("建議", recommendations, "無法取得"));
  } else if (result.outcome.terminalDecision === "not_suitable") {
    const review = result.decisionReview.notSuitable;
    const candidates = unique([
      ...(review?.candidateBehaviors ?? []).map(candidateBehaviorText),
      ...(result.decisionReview.authorEvidence?.candidateBehaviors ?? []).map(candidateBehaviorText),
    ]);
    output.push(
      `- 不建立測試原因：${sentence(result.decisionReview.reason ?? "目前沒有 valuable Unit Test scenario")}`,
      ...(candidates.length > 0 ? [`- 候選行為判讀：${list(candidates)}。`] : []),
    );
  }
  if (result.warnings.workflowIncidents.length > 0) output.push("", "### 執行異常與影響", "", ...table(
    ["類型", "階段", "影響", "Evidence", "處置"], result.warnings.workflowIncidents.map((item) => [
      item.kindLabel, item.phase, item.impact, item.evidence, item.disposition,
    ]),
  ));
  output.push("", "交付與證據：", "", "```text",
    `Test project: ${result.retainedArtifacts.testProjectPath ?? "無法取得"}`,
    ...result.retainedArtifacts.testFiles.map((item) => `測試檔: ${item}`),
    `Run evidence root: ${result.retainedArtifacts.runRoot ?? "無法取得"}`, "```");
  return output;
}

export function renderWorkflowResult(result) {
  return [
    `# ${result.identity.target} 單元測試結果`, "",
    "## 結果摘要", "", ...renderSummary(result), "",
    "## 測試內容", "", ...renderTestContent(result), "",
    "## 修正、異常與交付", "", ...renderDelivery(result), "",
    "## 各階段耗時", "", ...renderTiming(result), "",
    "## Token usage", "", ...renderTokens(result), "",
  ].join("\n");
}

export function writeWorkflowResult(resultPath, markdownPath, result) {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  fs.writeFileSync(markdownPath, renderWorkflowResult(result), { flag: "wx" });
}
