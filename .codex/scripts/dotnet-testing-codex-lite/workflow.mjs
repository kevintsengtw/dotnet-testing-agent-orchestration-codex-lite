#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  completePhase,
  finishManifest,
  markArtifactReady,
  startPhase,
} from "./lib/workflow-state.mjs";
import {
  buildWorkflowResult,
  writeWorkflowResult,
} from "./lib/workflow-result.mjs";
import { assertEnvironmentStop, buildOutputRoots } from "./lib/environment-stop.mjs";
import { startAutomaticUsage, appendUsageLink } from "./usage/automatic.mjs";

const repoRoot = process.cwd();

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const result = { command, scenarios: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const value = rest[index + 1];
    if (key === "--target-source") result.targetSource = value;
    else if (key === "--target-class") result.targetClass = value;
    else if (key === "--test-project") result.testProject = value;
    else if (key === "--run-id") result.runId = value;
    else if (key === "--manifest") result.manifest = value;
    else if (key === "--scenario") result.scenarios.push(value);
    else throw new Error(`未知參數: ${key}`);
    index += 1;
  }
  return result;
}

function safeName(value) {
  const cleaned = value.replace(/[^\p{L}\p{N}_.-]/gu, "_");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "_" : cleaned;
}

function shortClass(value) {
  return value.split(".").at(-1).replace(/[^\p{L}\p{N}_-]/gu, "_");
}

function defaultRunId(targetClass) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${timestamp}-${safeName(shortClass(targetClass))}-${suffix}`;
}

function writeJson(filePath, value, options = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (options.exclusive) fs.writeFileSync(filePath, text, { flag: "wx" });
  else fs.writeFileSync(filePath, text, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function compactOutput(result) {
  return (result.stderr || result.stdout || "command failed").trim().split(/\r?\n/u).slice(-12).join("\n");
}

function measuredFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return { path: filePath, characters: text.length };
}

function observedPath(value, manifest) {
  const raw = typeof value === "string" ? value : value?.path;
  if (typeof raw !== "string" || raw.length === 0) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(path.dirname(manifest.testProjectPath), raw);
}

function isDeterministicScript(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return relative === "scripts" || relative.startsWith(`scripts${path.sep}`) ||
    relative === path.join(".codex", "scripts") ||
    relative.startsWith(`${path.join(".codex", "scripts")}${path.sep}`);
}

function unquoteFrontmatterScalar(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function skillPurposeFromFrontmatter(text) {
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
  if (!frontmatter) return null;
  const lines = frontmatter.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)description:\s*(.*?)\s*$/u);
    if (!match) continue;
    const scalar = match[2];
    if (!/^[|>](?:[+-]?[1-9]|[1-9]?[+-])?$/u.test(scalar)) {
      const value = unquoteFrontmatterScalar(scalar);
      return value === "" ? null : value;
    }
    const fieldIndent = match[1].length;
    for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
      const line = lines[blockIndex];
      if (line.trim() === "") continue;
      const contentIndent = line.match(/^\s*/u)[0].length;
      if (contentIndent <= fieldIndent) return null;
      return line.trim();
    }
    return null;
  }
  return null;
}

function captureObservation(manifest, phase) {
  const artifact = readJson(phase.artifactPath);
  const inputs = artifact.tokenEstimateInputs ?? {};
  const warnings = [];
  const measureInputs = (values, excludeScripts) => [...new Set((values ?? [])
    .map((value) => observedPath(value, manifest))
    .filter(Boolean))]
    .map((filePath) => {
      if (excludeScripts && isDeterministicScript(filePath)) {
        warnings.push(`排除 deterministic script telemetry: ${filePath}`);
        return null;
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        warnings.push(`略過不存在的 observation path: ${filePath}`);
        return null;
      }
      return { ...measuredFile(filePath), measurementSource: "post-phase" };
    })
    .filter(Boolean);
  const accounting = ["agent-generated", "deterministic-copy", "deterministic-merge"]
    .includes(inputs.artifactAccounting)
    ? inputs.artifactAccounting
    : "agent-generated";
  const agentArtifactPath = accounting === "deterministic-merge"
    ? observedPath(inputs.agentArtifactPath, manifest)
    : null;
  const readFiles = measureInputs(inputs.readFiles, true);
  const skillReads = readFiles.flatMap((item) => {
    const normalized = item.path.replaceAll("\\", "/");
    const match = normalized.match(/\/(?:\.agents|\.codex)\/skills\/([^/]+)\/SKILL\.md$/u);
    if (!match) return [];
    const text = fs.readFileSync(item.path, "utf8");
    const description = skillPurposeFromFrontmatter(text);
    return [{ name: match[1], path: item.path, description }];
  });
  const observation = {
    schemaVersion: 2,
    target: manifest.targetClass,
    phase: phase.role,
    mode: phase.mode,
    artifactAccounting: accounting,
    artifact: measuredFile(phase.artifactPath),
    ...(agentArtifactPath && fs.existsSync(agentArtifactPath)
      ? { agentArtifact: measuredFile(agentArtifactPath) }
      : {}),
    readFiles,
    skillReads,
    writtenFiles: measureInputs(inputs.writtenFiles, false)
      .filter((item) => path.resolve(item.path) !== path.resolve(phase.artifactPath)),
    warnings,
  };
  const observationPath = path.join(
    manifest.runRoot,
    "observations",
    `${phase.role}-${phase.mode}.json`,
  );
  writeJson(observationPath, observation, { exclusive: true });
  phase.observationPath = observationPath;
}

function requireSuccess(script, args) {
  const result = runNode(script, args);
  if (result.status !== 0) throw new Error(`${path.basename(script)}: ${compactOutput(result)}`);
  return result.stdout.trim();
}

function manifestAction(manifest, role, mode) {
  const action = buildManifestAction(manifest, role, mode);
  const payloadPath = path.join(manifest.runRoot, "dispatch", `${role}-${mode}.json`);
  writeJson(payloadPath, action.payload, { exclusive: true });
  return { ...action, payloadPath };
}

function buildManifestAction(manifest, role, mode) {
  if (role === "author") {
    const authorResultPath = mode === "initial"
      ? manifest.paths.authorInitial
      : manifest.paths.authorRepair;
    return {
      type: mode === "initial" ? "dispatch_author" : "dispatch_author_repair",
      role: "dotnet-testing-lite-unit-author",
      mode,
      forkTurns: "none",
      payload: {
        mode,
        targetSourcePath: manifest.targetSourcePath,
        targetClass: manifest.targetClass,
        testProjectPath: manifest.testProjectPath,
        testProjectMode: manifest.testProjectMode,
        outputTestPath: manifest.outputTestPath,
        userScenarioManifestPath: manifest.paths.userScenarios,
        authorResultPath,
        phaseStopPath: mode === "initial"
          ? manifest.paths.authorInitialStop
          : manifest.paths.authorRepairStop,
        ...(mode === "repair" ? {
          repairManifestPath: manifest.paths.repair,
          previousAuthorResultPath: manifest.paths.authorInitial,
        } : {}),
      },
      manifestPath: manifest.manifestPath,
    };
  }
  const isFinal = mode === "final";
  const authorResultPath = isFinal ? manifest.paths.authorRepair : manifest.paths.authorInitial;
  const verificationOutputPath = isFinal
    ? manifest.paths.verificationFinal
    : manifest.paths.verificationInitial;
  return {
    type: isFinal ? "dispatch_verifier_final" : "dispatch_verifier",
    role: "dotnet-testing-lite-unit-verifier",
    mode,
    forkTurns: "none",
    payload: {
      targetSourcePath: manifest.targetSourcePath,
      targetClass: manifest.targetClass,
      testProjectPath: manifest.testProjectPath,
      authorResultPath,
      verificationOutputPath,
      projectValidationPath: isFinal
        ? manifest.paths.projectFinal
        : manifest.paths.projectInitial,
      productionBaselinePath: manifest.paths.productionBaseline,
      userScenarioManifestPath: manifest.paths.userScenarios,
      repairManifestPath: manifest.paths.repair,
      phaseStopPath: isFinal
        ? manifest.paths.verifierFinalStop
        : manifest.paths.verifierInitialStop,
      isFinal,
      ...(isFinal ? { initialVerificationPath: manifest.paths.verificationInitial } : {}),
      ...(isFinal ? { initialAuthorResultPath: manifest.paths.authorInitial } : {}),
    },
    manifestPath: manifest.manifestPath,
  };
}

function createPaths(testProjectPath, runId, targetClass) {
  const testProjectDirectory = path.dirname(testProjectPath);
  const orchestratorRoot = path.join(testProjectDirectory, ".orchestrator");
  const runRoot = path.join(orchestratorRoot, "runs", runId, safeName(targetClass));
  return {
    orchestratorRoot,
    runRoot,
    activeLock: path.join(orchestratorRoot, "active-run.json"),
    manifest: path.join(runRoot, "run.json"),
    userScenarios: path.join(runRoot, "input", "user-scenarios.json"),
    productionBaseline: path.join(runRoot, "baseline", "production.json"),
    testIntegrityInitial: path.join(runRoot, "baseline", "tests-initial.json"),
    testIntegrityFinal: path.join(runRoot, "baseline", "tests-final.json"),
    authorInitial: path.join(runRoot, "author", "initial.json"),
    authorRepair: path.join(runRoot, "author", "repair.json"),
    authorInitialStop: path.join(runRoot, "stops", "author-initial.json"),
    authorRepairStop: path.join(runRoot, "stops", "author-repair.json"),
    verificationInitial: path.join(runRoot, "verification", "initial.json"),
    verificationFinal: path.join(runRoot, "verification", "final.json"),
    verifierInitialStop: path.join(runRoot, "stops", "verifier-initial.json"),
    verifierFinalStop: path.join(runRoot, "stops", "verifier-final.json"),
    projectInitial: path.join(runRoot, "verification", "project-initial.json"),
    projectFinal: path.join(runRoot, "verification", "project-final.json"),
    repair: path.join(runRoot, "repair", "repair.json"),
    result: path.join(runRoot, "result", "result.json"),
    resultMarkdown: path.join(runRoot, "result", "result.md"),
  };
}

function start(args) {
  for (const key of ["targetSource", "targetClass", "testProject"]) {
    if (!args[key]) throw new Error(`start 缺少 --${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  const targetSourcePath = path.resolve(args.targetSource);
  const testProjectPath = path.resolve(args.testProject);
  if (!fs.existsSync(targetSourcePath)) throw new Error(`target source 不存在: ${targetSourcePath}`);
  const runId = safeName(args.runId ?? defaultRunId(args.targetClass));
  const paths = createPaths(testProjectPath, runId, args.targetClass);
  if (fs.existsSync(paths.runRoot)) throw new Error(`run identity 已存在: ${paths.runRoot}`);
  writeJson(paths.activeLock, {
    schemaVersion: 1,
    runId,
    targetClass: args.targetClass,
    manifestPath: paths.manifest,
  }, { exclusive: true });
  try {
    fs.mkdirSync(paths.runRoot, { recursive: true });
    writeJson(paths.userScenarios, {
      schemaVersion: 1,
      scenarios: args.scenarios.map((text, index) => ({
        id: `USR-${String(index + 1).padStart(3, "0")}`,
        text,
      })),
    }, { exclusive: true });
    requireSuccess(".codex/scripts/dotnet-testing-codex-lite/gates/check-production-integrity.mjs", [
      "capture",
      "--target-source", targetSourcePath,
      "--output", paths.productionBaseline,
    ]);
    const startedAtEpochMs = Date.now();
    const manifest = {
      schemaVersion: 3,
      runId,
      runRoot: paths.runRoot,
      manifestPath: paths.manifest,
      targetSourcePath,
      targetClass: args.targetClass,
      testProjectPath,
      testProjectMode: fs.existsSync(testProjectPath) ? "use-existing" : "create",
      outputTestPath: path.join(path.dirname(testProjectPath), `${shortClass(args.targetClass)}Tests.cs`),
      topology: "Lite Orchestrator → Lite Unit Author → Lite Unit Verifier",
      lifecycleStatus: "running",
      terminalDecision: null,
      stopReason: null,
      deliveryStatus: "not_run",
      qualityStatus: "not_applicable",
      coverageStatus: "not_run",
      testIntegrityStatus: "not_run",
      startedAt: new Date(startedAtEpochMs).toISOString(),
      startedAtEpochMs,
      repairUsed: false,
      phases: [],
      workflowIncidents: [],
      paths,
    };
    startPhase(manifest, "author", "initial", paths.authorInitial, startedAtEpochMs);
    writeJson(paths.manifest, manifest, { exclusive: true });
    startAutomaticUsage(manifest);
    console.log(JSON.stringify(manifestAction(manifest, "author", "initial")));
  } catch (error) {
    if (fs.existsSync(paths.activeLock)) fs.rmSync(paths.activeLock);
    throw error;
  }
}

function projectGate(manifest, author, mode) {
  const projectPath = mode === "final" ? manifest.paths.projectFinal : manifest.paths.projectInitial;
  const args = [
    "--test-project", manifest.testProjectPath,
    "--production-baseline", manifest.paths.productionBaseline,
    "--output", projectPath,
  ];
  if (["no_valuable_tests", "blocked"].includes(author.status)) args.push("--allow-no-test-files");
  else for (const testFile of author.testFilePaths ?? []) args.push("--test-file", testFile);
  requireSuccess(".codex/scripts/dotnet-testing-codex-lite/gates/check-test-project.mjs", args);
}

function createNoTestVerificationBase(manifest, author, outputPath) {
  writeJson(outputPath, {
    schemaVersion: 1,
    status: author.status,
    phaseIncidents: [],
    runnerIncidents: [],
    build: { status: "not_run", warnings: { count: 0, codes: [], lines: [] } },
    test: { status: "not_run" },
    coverage: { status: "not_applicable" },
    goal: { status: "not_applicable", met: false },
    durationMs: 0,
    productionIntegrity: { status: productionIntegrity(manifest) },
  });
}

function authorGates(manifest, authorPath, mode) {
  const author = readJson(authorPath);
  if (author.status === "environment_blocked") {
    const expectedResultPath = mode === "repair"
      ? manifest.paths.authorRepair
      : manifest.paths.authorInitial;
    return assertEnvironmentStop(author, {
      role: "author",
      phase: mode,
      target: manifest.targetClass,
      allowedPaths: [manifest.outputTestPath, manifest.testProjectPath, expectedResultPath],
      buildOutputRoots: buildOutputRoots(manifest, repoRoot),
    });
  }
  requireSuccess(".codex/scripts/dotnet-testing-codex-lite/gates/check-unit-author-result.mjs", [
    authorPath,
    "--user-scenarios", manifest.paths.userScenarios,
  ]);
  projectGate(manifest, author, mode === "repair" ? "final" : "initial");
  if (!["no_valuable_tests", "blocked"].includes(author.status)) {
    requireSuccess(".codex/scripts/dotnet-testing-codex-lite/gates/check-test-integrity.mjs", [
      "capture",
      "--author-result", authorPath,
      "--output", mode === "repair"
        ? manifest.paths.testIntegrityFinal
        : manifest.paths.testIntegrityInitial,
    ]);
  }
  return author;
}

function verifierGates(manifest, verificationPath, mode) {
  let verification = readJson(verificationPath);
  const integrityPath = mode === "final"
    ? manifest.paths.testIntegrityFinal
    : manifest.paths.testIntegrityInitial;
  if (fs.existsSync(integrityPath)) {
    try {
      requireSuccess(".codex/scripts/dotnet-testing-codex-lite/gates/check-test-integrity.mjs", ["verify", "--manifest", integrityPath]);
      manifest.testIntegrityStatus = "passed";
    } catch (error) {
      manifest.testIntegrityStatus = "failed";
      throw error;
    }
  } else {
    manifest.testIntegrityStatus = "not_applicable";
  }
  if (verification.status === "environment_blocked") {
    const expectedVerificationPath = mode === "final"
      ? manifest.paths.verificationFinal
      : manifest.paths.verificationInitial;
    const normalizedStop = assertEnvironmentStop(verification, {
      buildOutputRoots: buildOutputRoots(manifest, repoRoot),
      role: "verifier",
      phase: mode,
      target: manifest.targetClass,
      allowedPaths: [
        expectedVerificationPath,
        `${expectedVerificationPath}.summary.json`,
        `${expectedVerificationPath}.supplement.json`,
        mode === "final" ? manifest.paths.projectFinal : manifest.paths.projectInitial,
        manifest.paths.repair,
      ],
    });
    return { verification: normalizedStop, decision: "environment_blocked" };
  }
  const authorPath = mode === "final" ? manifest.paths.authorRepair : manifest.paths.authorInitial;
  const author = readJson(authorPath);
  requireSuccess(".codex/scripts/dotnet-testing-codex-lite/gates/check-unit-author-result.mjs", [
    authorPath,
    "--user-scenarios", manifest.paths.userScenarios,
  ]);
  projectGate(manifest, author, mode);
  const decision = verification.coverageDecision?.status;
  let repairEligibility = null;
  if (decision === "needs_repair") {
    const repair = readJson(manifest.paths.repair);
    const scopes = [
      (repair.coverageGaps?.length ?? 0) > 0 ? "coverage" : null,
      (repair.qualityGaps?.length ?? 0) > 0 ? "quality" : null,
      repair.testDeliveryGap ? "test-delivery" : null,
    ].filter(Boolean);
    repairEligibility = {
      status: "eligible",
      scope: scopes.length === 1 ? scopes[0] : "mixed",
      ...(verification.build?.status === "failed" ? { failedPhase: "build" }
        : verification.test?.status === "failed" ? { failedPhase: "test" } : {}),
    };
  }
  verification = {
    ...verification,
    isFinal: decision !== "needs_repair",
    projectValidation: {
      status: "passed",
      path: mode === "final" ? manifest.paths.projectFinal : manifest.paths.projectInitial,
    },
    authorResultPath: authorPath,
    deliverables: {
      testProjectPath: manifest.testProjectPath,
      testFilePaths: author.testFilePaths ?? [],
    },
    repairEligibility,
    repairManifestPath: decision === "needs_repair" ? manifest.paths.repair : null,
  };
  writeJson(verificationPath, verification);
  requireSuccess(".codex/scripts/dotnet-testing-codex-lite/validate-result.mjs", [
    "--manifest", verificationPath,
    "--require-quality",
  ]);
  return { verification, decision };
}

function readIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try { return readJson(filePath); } catch { return null; }
}

function releaseActiveLock(manifest) {
  if (!fs.existsSync(manifest.paths.activeLock)) return;
  const active = readJson(manifest.paths.activeLock);
  if (active.runId !== manifest.runId) throw new Error("active run identity 不一致，拒絕釋放 lock");
  fs.rmSync(manifest.paths.activeLock);
}

function productionIntegrity(manifest) {
  const result = runNode(".codex/scripts/dotnet-testing-codex-lite/gates/check-production-integrity.mjs", [
    "verify", "--manifest", manifest.paths.productionBaseline,
  ]);
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.passed ? "passed" : "failed";
  } catch {
    return "unavailable";
  }
}

function finalize(manifest, decision, details = {}) {
  finishManifest(manifest, decision, details);
  const production = productionIntegrity(manifest);
  if (production !== "passed") {
    manifest.workflowIncidents.push({
      kind: production === "failed" ? "production_integrity_failed" : "production_integrity_unavailable",
      message: production === "failed"
        ? "production source changed during the workflow"
        : "production integrity could not be verified",
    });
    Object.assign(manifest, {
      lifecycleStatus: "failed",
      terminalDecision: "fail",
      stopReason: "integrity",
      deliveryStatus: "failed",
    });
  }
  const workflowFinishedAtEpochMs = Date.now();
  manifest.workflowFinishedAt = new Date(workflowFinishedAtEpochMs).toISOString();
  manifest.workflowFinishedAtEpochMs = workflowFinishedAtEpochMs;
  manifest.finishedAt = manifest.workflowFinishedAt;
  manifest.durationMs = Math.max(0, workflowFinishedAtEpochMs - manifest.startedAtEpochMs);
  writeJson(manifest.manifestPath, manifest);
  const authorInitial = readIfExists(manifest.paths.authorInitial);
  const authorRepair = readIfExists(manifest.paths.authorRepair);
  const verificationInitial = readIfExists(manifest.paths.verificationInitial);
  const verificationFinal = readIfExists(manifest.paths.verificationFinal);
  const author = manifest.repairUsed ? authorRepair : authorInitial;
  const verification = manifest.repairUsed ? verificationFinal : verificationInitial;
  const result = buildWorkflowResult(manifest, {
    author,
    verification,
    authorInitial,
    authorRepair,
    verificationInitial,
    verificationFinal,
    initialVerification: verificationInitial,
    userScenarios: readIfExists(manifest.paths.userScenarios),
    repair: readIfExists(manifest.paths.repair),
    productionIntegrity: production,
    testIntegrity: manifest.testIntegrityStatus,
  });
  writeWorkflowResult(manifest.paths.result, manifest.paths.resultMarkdown, result);
  appendUsageLink(manifest);
  releaseActiveLock(manifest);
  console.log(JSON.stringify({
    type: "terminal",
    lifecycleStatus: manifest.lifecycleStatus,
    terminalDecision: manifest.terminalDecision,
    stopReason: manifest.stopReason,
    resultPath: manifest.paths.result,
    resultMarkdownPath: manifest.paths.resultMarkdown,
    manifestPath: manifest.manifestPath,
  }));
}

function failWorkflow(manifest, error) {
  const phase = manifest.phases.at(-1);
  if (phase?.status === "running") {
    const completedAtEpochMs = Date.now();
    phase.status = "failed";
    phase.resultStatus = "fail";
    phase.completedAt = new Date(completedAtEpochMs).toISOString();
    phase.completedAtEpochMs = completedAtEpochMs;
    phase.finishedAt = phase.completedAt;
    phase.durationMs = Math.max(
      0,
      completedAtEpochMs - (phase.dispatchIssuedAtEpochMs ?? phase.startedAtEpochMs),
    );
    phase.driverValidationMs = Number.isFinite(phase.artifactReadyAtEpochMs)
      ? Math.max(0, completedAtEpochMs - phase.artifactReadyAtEpochMs)
      : null;
  }
  manifest.workflowIncidents.push({ kind: "contract_failure", message: error.message });
  finalize(manifest, "fail", { stopReason: "contract" });
}

function advance(args) {
  if (!args.manifest) throw new Error("advance 缺少 --manifest");
  const manifestPath = path.resolve(args.manifest);
  const manifest = readJson(manifestPath);
  if (manifest.lifecycleStatus !== "running") throw new Error("run 已 terminal，不得 advance");
  const phase = manifest.phases.at(-1);
  if (!phase || phase.status !== "running") throw new Error("沒有等待結果的 phase");
  try {
    const stopPath = phase.role === "author"
      ? phase.mode === "initial" ? manifest.paths.authorInitialStop : manifest.paths.authorRepairStop
      : phase.mode === "initial" ? manifest.paths.verifierInitialStop : manifest.paths.verifierFinalStop;
    if (fs.existsSync(stopPath)) {
      phase.plannedArtifactPath = phase.artifactPath;
      phase.artifactPath = stopPath;
    }
    if (!fs.existsSync(phase.artifactPath)) throw new Error(`phase artifact 不存在: ${phase.artifactPath}`);
    markArtifactReady(manifest, Math.round(fs.statSync(phase.artifactPath).mtimeMs));
    if (phase.role === "author") {
      const author = authorGates(manifest, phase.artifactPath, phase.mode);
      captureObservation(manifest, phase);
      completePhase(manifest, author.status);
      if (author.status === "environment_blocked") {
        finalize(manifest, "environment_blocked");
        return;
      }
      const verifierMode = phase.mode === "repair" ? "final" : "initial";
      const artifact = verifierMode === "final"
        ? manifest.paths.verificationFinal
        : manifest.paths.verificationInitial;
      if (["no_valuable_tests", "blocked"].includes(author.status)) {
        createNoTestVerificationBase(manifest, author, artifact);
      }
      startPhase(manifest, "verifier", verifierMode, artifact);
      writeJson(manifestPath, manifest);
      console.log(JSON.stringify(manifestAction(manifest, "verifier", verifierMode)));
      return;
    }
    const { verification, decision } = verifierGates(manifest, phase.artifactPath, phase.mode);
    captureObservation(manifest, phase);
    completePhase(manifest, decision);
    if (decision === "environment_blocked") {
      finalize(manifest, "environment_blocked", { deliveryStatus: "passed" });
      return;
    }
    if (decision === "needs_repair") {
      if (!verification.repairManifestPath || !fs.existsSync(path.resolve(verification.repairManifestPath))) {
        throw new Error("needs_repair 缺少可讀 repair manifest");
      }
      if (path.resolve(verification.repairManifestPath) !== path.resolve(manifest.paths.repair)) {
        throw new Error("repair manifest path 不符合 run contract");
      }
      startPhase(manifest, "author", "repair", manifest.paths.authorRepair);
      writeJson(manifestPath, manifest);
      console.log(JSON.stringify(manifestAction(manifest, "author", "repair")));
      return;
    }
    if (decision === "tool_incident") {
      finalize(manifest, "tool_incident", { deliveryStatus: "passed" });
      return;
    }
    finalize(manifest, decision, {
      ...(decision === "fail" && verification.build?.status === "failed" ? { stopReason: "build_failed" } : {}),
      qualityStatus: verification.quality?.status === "pass" ? "pass" : "issues",
    });
  } catch (error) {
    failWorkflow(manifest, error);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "start") start(args);
  else if (args.command === "advance") advance(args);
  else throw new Error("command 必須是 start 或 advance");
} catch (error) {
  console.error(`lite-unit-workflow error: ${error.message}`);
  process.exitCode = 1;
}
