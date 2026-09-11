const authorInitialStatuses = new Set([
  "completed",
  "partial",
  "no_valuable_tests",
  "blocked",
  "environment_blocked",
]);

const authorRepairStatuses = new Set([
  "completed",
  "partial",
  "environment_blocked",
]);

const verifierInitialDecisions = new Set([
  "pass",
  "best_effort",
  "needs_repair",
  "fail",
  "not_suitable",
  "blocked",
  "environment_blocked",
  "tool_incident",
]);

const verifierFinalDecisions = new Set([
  "pass",
  "best_effort",
  "fail",
  "environment_blocked",
  "tool_incident",
]);

export function normalizeTerminalDecision(decision) {
  return decision === "environment_blocked" || decision === "tool_incident"
    ? "unavailable"
    : decision;
}

export function terminalEnvelope(decision, details = {}) {
  if (decision === "environment_blocked") {
    return {
      lifecycleStatus: "stopped",
      terminalDecision: "unavailable",
      stopReason: "environment_protection",
      deliveryStatus: details.deliveryStatus ?? "not_run",
      qualityStatus: "not_applicable",
      coverageStatus: "not_run",
    };
  }
  if (decision === "tool_incident") {
    return {
      lifecycleStatus: "stopped",
      terminalDecision: "unavailable",
      stopReason: "tool_incident",
      deliveryStatus: details.deliveryStatus ?? "passed",
      qualityStatus: details.qualityStatus ?? "not_applicable",
      coverageStatus: details.coverageStatus ?? "unavailable",
    };
  }
  if (decision === "fail") {
    return {
      lifecycleStatus: "failed",
      terminalDecision: "fail",
      stopReason: details.stopReason ?? "contract",
      deliveryStatus: details.deliveryStatus ?? "failed",
      qualityStatus: details.qualityStatus ?? "issues",
      coverageStatus: details.coverageStatus ?? "unavailable",
    };
  }
  if (decision === "blocked" || decision === "not_suitable") {
    return {
      lifecycleStatus: "completed",
      terminalDecision: decision,
      stopReason: null,
      deliveryStatus: "not_run",
      qualityStatus: "not_applicable",
      coverageStatus: "not_run",
    };
  }
  return {
    lifecycleStatus: "completed",
    terminalDecision: decision,
    stopReason: null,
    deliveryStatus: "passed",
    qualityStatus: details.qualityStatus ?? "pass",
    coverageStatus: decision === "pass" ? "complete" : "best_effort",
  };
}

export function assertAuthorStatus(status, mode) {
  const allowed = mode === "initial" ? authorInitialStatuses : authorRepairStatuses;
  if (!allowed.has(status)) {
    throw new Error(`author/${mode} status 無效: ${String(status)}`);
  }
  return status;
}

export function assertVerifierDecision(decision, mode) {
  const allowed = mode === "initial" ? verifierInitialDecisions : verifierFinalDecisions;
  if (!allowed.has(decision)) {
    throw new Error(`verifier/${mode} decision 無效: ${String(decision)}`);
  }
  return decision;
}

export function nextAction(manifest) {
  if (manifest.lifecycleStatus !== "running") return { type: "terminal" };
  const phase = manifest.phases.at(-1);
  if (!phase) return { type: "dispatch_author", mode: "initial" };
  if (phase.status === "running") {
    return { type: "await_phase_result", phase: phase.role, mode: phase.mode };
  }
  if (phase.role === "author") {
    if (phase.resultStatus === "environment_blocked") return { type: "terminal" };
    return { type: "dispatch_verifier", mode: phase.mode === "repair" ? "final" : "initial" };
  }
  if (phase.role === "verifier" && phase.resultStatus === "needs_repair") {
    if (manifest.repairUsed) throw new Error("每個 target 只能使用一次 repair");
    return { type: "dispatch_author", mode: "repair" };
  }
  return { type: "terminal" };
}

export function startPhase(manifest, role, mode, artifactPath, now = Date.now()) {
  const expected = nextAction(manifest);
  const expectedType = role === "author" ? "dispatch_author" : "dispatch_verifier";
  if (expected.type !== expectedType || expected.mode !== mode) {
    throw new Error(`phase 順序錯誤: expected ${expected.type}/${expected.mode ?? "none"}`);
  }
  if (mode === "repair") manifest.repairUsed = true;
  manifest.phases.push({
    role,
    mode,
    status: "running",
    artifactPath,
    dispatchIssuedAt: new Date(now).toISOString(),
    dispatchIssuedAtEpochMs: now,
    dispatchAcceptedAt: null,
    dispatchAcceptedAtEpochMs: null,
    dispatchAcceptedUnavailableReason: "Codex runtime 未向 deterministic driver 提供 assignment accepted timestamp",
    startedAt: new Date(now).toISOString(),
    startedAtEpochMs: now,
  });
  return manifest.phases.at(-1);
}

export function markArtifactReady(manifest, now = Date.now()) {
  const phase = manifest.phases.at(-1);
  if (!phase || phase.status !== "running") throw new Error("沒有可標記 artifact ready 的 running phase");
  const readyAt = Math.max(now, phase.dispatchIssuedAtEpochMs ?? phase.startedAtEpochMs ?? now);
  phase.artifactReadyAt = new Date(readyAt).toISOString();
  phase.artifactReadyAtEpochMs = readyAt;
  return phase;
}

export function completePhase(manifest, resultStatus, now = Date.now()) {
  const phase = manifest.phases.at(-1);
  if (!phase || phase.status !== "running") throw new Error("沒有可完成的 running phase");
  if (phase.role === "author") assertAuthorStatus(resultStatus, phase.mode);
  else assertVerifierDecision(resultStatus, phase.mode);
  phase.resultStatus = resultStatus;
  const finishedAt = new Date(now).toISOString();
  if (resultStatus === "environment_blocked") {
    phase.status = "stopped";
    phase.stoppedAt = finishedAt;
    phase.stoppedAtEpochMs = now;
  } else {
    phase.status = "completed";
    phase.completedAt = finishedAt;
    phase.completedAtEpochMs = now;
  }
  phase.finishedAt = finishedAt;
  phase.finishedAtEpochMs = now;
  phase.durationMs = Math.max(0, now - (phase.dispatchIssuedAtEpochMs ?? phase.startedAtEpochMs));
  phase.driverValidationMs = Number.isFinite(phase.artifactReadyAtEpochMs)
    ? Math.max(0, now - phase.artifactReadyAtEpochMs)
    : null;
  return phase;
}

export function finishManifest(manifest, decision, details = {}, now = Date.now()) {
  if (manifest.phases.some((phase) => phase.status === "running")) {
    throw new Error("存在 running phase，不得 finish");
  }
  Object.assign(manifest, terminalEnvelope(decision, details));
  manifest.terminalDecisionAt = new Date(now).toISOString();
  manifest.terminalDecisionAtEpochMs = now;
  manifest.finishedAt = new Date(now).toISOString();
  manifest.durationMs = Math.max(0, now - manifest.startedAtEpochMs);
  return manifest;
}
