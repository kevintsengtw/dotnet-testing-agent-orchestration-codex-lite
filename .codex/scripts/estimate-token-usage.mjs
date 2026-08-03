#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const orchestratorFiles = [
  ".codex/skills/dotnet-testing-lite-orchestrator-unit/SKILL.md",
];
const authorInitialFiles = [
  ".codex/agents/dotnet-testing-lite-unit-author.toml",
  ".agents/skills/dotnet-testing-unit-authoring/SKILL.md",
];
const authorRepairFiles = [
  ".codex/agents/dotnet-testing-lite-unit-author.toml",
  ".agents/skills/dotnet-testing-unit-authoring/SKILL.md",
];
const verifierInitialFiles = [
  ".codex/agents/dotnet-testing-lite-unit-verifier.toml",
  ".agents/skills/dotnet-test/SKILL.md",
];
const verifierFinalFiles = [
  ".codex/agents/dotnet-testing-lite-unit-verifier.toml",
  ".agents/skills/dotnet-test/SKILL.md",
];
const conditionalEntryFiles = [
  ".agents/skills/dotnet-testing-unit-test-fundamentals/SKILL.md",
  ".agents/skills/dotnet-testing-test-naming-conventions/SKILL.md",
  ".agents/skills/dotnet-testing-awesome-assertions-guide/SKILL.md",
  ".agents/skills/dotnet-testing-xunit-project-setup/SKILL.md",
  ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md",
  ".agents/skills/dotnet-testing-datetime-testing-timeprovider/SKILL.md",
  ".agents/skills/dotnet-testing-filesystem-testing-abstractions/SKILL.md",
  ".agents/skills/dotnet-testing-fluentvalidation-testing/SKILL.md",
  ".agents/skills/dotnet-testing-unit-patterns/SKILL.md",
  ".agents/skills/dotnet-testing-unit-patterns/references/data-generation.md",
  ".agents/skills/dotnet-testing-unit-patterns/references/legacy-boundaries.md",
];
const fixedContractPaths = new Set(
  [
    ...orchestratorFiles,
    ...authorInitialFiles,
    ...authorRepairFiles,
    ...verifierInitialFiles,
    ...verifierFinalFiles,
  ].map((file) => path.resolve(root, file)),
);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--test-project") result.testProject = argv[++index];
    else if (argv[index] === "--target") result.target = argv[++index];
    else if (argv[index] === "--output") result.output = argv[++index];
    else throw new Error(`未知參數: ${argv[index]}`);
  }
  return result;
}

function measure(files) {
  const rows = files.map((file) => {
    const characters = fs.readFileSync(path.join(root, file), "utf8").length;
    return { file, characters, estimatedTokens: Math.round(characters / 3.6) };
  });
  return {
    files: rows,
    characters: rows.reduce((sum, row) => sum + row.characters, 0),
    estimatedTokens: rows.reduce((sum, row) => sum + row.estimatedTokens, 0),
  };
}

function walk(directory, suffix) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath, suffix) : fullPath.endsWith(suffix) ? [fullPath] : [];
  });
}

function resolveObservedPath(value, testProjectDir) {
  if (!value || typeof value !== "string") return null;
  if (path.isAbsolute(value)) return value;
  const fromRoot = path.resolve(root, value);
  return fs.existsSync(fromRoot) ? fromRoot : path.resolve(testProjectDir, value);
}

function safeTargetName(value) {
  return value.replace(/[^\p{L}\p{N}_.-]/gu, "_");
}

function runtimeEstimate(testProject, excludedArtifact, target) {
  const testProjectPath = path.resolve(root, testProject);
  const testProjectDir = path.dirname(testProjectPath);
  const excludedPath = excludedArtifact ? path.resolve(root, excludedArtifact) : null;
  const artifacts = walk(path.join(testProjectDir, ".orchestrator"), ".json")
    .filter((artifact) =>
      !artifact.endsWith(".summary.json") && !artifact.endsWith(".supplement.json"))
    .filter((artifact) => path.resolve(artifact) !== excludedPath);
  let phaseObservationFiles = walk(
    path.join(testProjectDir, ".orchestrator", "observations"),
    ".json",
  );
  if (target) {
    phaseObservationFiles = phaseObservationFiles.filter((observationPath) => {
      try {
        const observation = JSON.parse(fs.readFileSync(observationPath, "utf8"));
        return observation.target === target ||
          observationPath.includes(
            `${path.sep}observations${path.sep}${safeTargetName(target)}${path.sep}`,
          );
      } catch {
        return false;
      }
    });
  }
  const observations = [];
  const fixedContractReadDuplicates = [];
  let authorArtifactCount = 0;
  let verifierArtifactCount = 0;

  for (const artifact of artifacts) {
    if (artifact.includes(`${path.sep}.orchestrator${path.sep}author${path.sep}`)) {
      authorArtifactCount += 1;
    }
    if (artifact.includes(`${path.sep}.orchestrator${path.sep}verification${path.sep}`)) {
      verifierArtifactCount += 1;
    }
    const text = fs.readFileSync(artifact, "utf8");
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }
    const accounting = json.tokenEstimateInputs?.artifactAccounting ?? "agent-generated";
    const agentArtifactPath = resolveObservedPath(
      json.tokenEstimateInputs?.agentArtifactPath,
      testProjectDir,
    );
    if (accounting !== "deterministic-copy") {
      const outputPath = accounting === "deterministic-merge" && agentArtifactPath
        ? agentArtifactPath
        : artifact;
      if (fs.existsSync(outputPath)) {
        const outputText = fs.readFileSync(outputPath, "utf8");
        observations.push({
          kind: "writtenArtifact",
          path: outputPath,
          characters: outputText.length,
          estimatedTokens: Math.round(outputText.length / 3.6),
        });
      }
    }
    for (const value of json.tokenEstimateInputs?.readFiles ?? []) {
      const filePath = resolveObservedPath(typeof value === "string" ? value : value?.path, testProjectDir);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
      const characters = fs.readFileSync(filePath, "utf8").length;
      if (fixedContractPaths.has(path.resolve(filePath))) {
        fixedContractReadDuplicates.push({
          path: filePath,
          characters,
          estimatedTokens: Math.round(characters / 3.6),
        });
        continue;
      }
      observations.push({
        kind: "readFile",
        path: filePath,
        characters,
        estimatedTokens: Math.round(characters / 3.6),
      });
    }
    for (const value of json.tokenEstimateInputs?.writtenFiles ?? []) {
      const filePath = resolveObservedPath(typeof value === "string" ? value : value?.path, testProjectDir);
      if (
        !filePath ||
        path.resolve(filePath) === path.resolve(artifact) ||
        (agentArtifactPath && path.resolve(filePath) === path.resolve(agentArtifactPath)) ||
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
      ) {
        continue;
      }
      const characters = fs.readFileSync(filePath, "utf8").length;
      observations.push({
        kind: "writtenFile",
        path: filePath,
        characters,
        estimatedTokens: Math.round(characters / 3.6),
      });
    }
  }

  const orchestratorRoot = path.join(testProjectDir, ".orchestrator");
  const canonicalRunManifestPath = target
    ? path.join(orchestratorRoot, "runs", `${safeTargetName(target)}.json`)
    : null;
  const legacyRunManifestPath = path.join(orchestratorRoot, "run.json");
  const runManifestPaths = canonicalRunManifestPath
    ? [canonicalRunManifestPath, legacyRunManifestPath].filter(fs.existsSync)
    : [
        ...walk(path.join(orchestratorRoot, "runs"), ".json"),
        ...(fs.existsSync(legacyRunManifestPath) ? [legacyRunManifestPath] : []),
      ];
  let phaseRuns = [];
  let phaseRunManifestAvailable = false;
  if (runManifestPaths.length > 0) {
    try {
      phaseRuns = runManifestPaths.flatMap((runManifestPath) => {
        const runManifest = JSON.parse(fs.readFileSync(runManifestPath, "utf8"));
        if (target && runManifest.target !== target) return [];
        return Array.isArray(runManifest.phaseRuns)
          ? runManifest.phaseRuns.map((item) => ({ ...item, target: runManifest.target }))
          : [];
      });
      phaseRunManifestAvailable = true;
    } catch {
      phaseRuns = [];
    }
  }

  let measurementMode = "legacy-current-artifacts";
  let phaseObservationComplete = null;
  const telemetryWarnings = [];
  if (phaseObservationFiles.length > 0) {
    if (!phaseRunManifestAvailable) {
      throw new Error("phase observations require run.json");
    }
    measurementMode = "phase-observations";
    observations.length = 0;
    fixedContractReadDuplicates.length = 0;
    authorArtifactCount = 0;
    verifierArtifactCount = 0;
    const phaseKeys = new Set();
    for (const observationPath of phaseObservationFiles) {
      const observation = JSON.parse(fs.readFileSync(observationPath, "utf8"));
      if (observation.schemaVersion !== 1 ||
          !["author", "verifier"].includes(observation.phase) ||
          typeof observation.mode !== "string") {
        throw new Error(`invalid phase observation: ${observationPath}`);
      }
      const key = `${observation.target ?? target ?? "legacy"}:${observation.phase}:${observation.mode}`;
      if (phaseKeys.has(key)) throw new Error(`duplicate phase observation: ${key}`);
      phaseKeys.add(key);
      if (observation.phase === "author") authorArtifactCount += 1;
      else verifierArtifactCount += 1;
      if (observation.artifactAccounting !== "deterministic-copy") {
        const artifact = observation.artifactAccounting === "deterministic-merge"
          ? observation.agentArtifact
          : observation.artifact;
        if (!artifact) throw new Error(`missing agent artifact: ${observationPath}`);
        observations.push({
          kind: "writtenArtifact",
          phase: observation.phase,
          mode: observation.mode,
          ...artifact,
        });
      }
      for (const item of observation.readFiles ?? []) {
        if (fixedContractPaths.has(path.resolve(item.path))) {
          fixedContractReadDuplicates.push(item);
        } else {
          observations.push({
            kind: "readFile",
            phase: observation.phase,
            mode: observation.mode,
            ...item,
          });
        }
      }
      for (const item of observation.writtenFiles ?? []) {
        observations.push({
          kind: "writtenFile",
          phase: observation.phase,
          mode: observation.mode,
          ...item,
        });
      }
    }
    const terminalRuns = phaseRuns.filter((item) => item.status !== "running");
      const missing = terminalRuns.filter((item) =>
      !item.observationPath ||
      !fs.existsSync(item.observationPath) ||
      !phaseKeys.has(`${item.target ?? target ?? "legacy"}:${item.phase}:${item.mode}`) &&
      !phaseKeys.has(`legacy:${item.phase}:${item.mode}`),
    );
    if (missing.length > 0 || terminalRuns.length !== phaseObservationFiles.length) {
      measurementMode = "phase-observations-incomplete";
      phaseObservationComplete = false;
      telemetryWarnings.push("phase observations are incomplete");
    } else {
      phaseObservationComplete = true;
    }
  }

  return {
    status: phaseObservationComplete === false
      ? "unavailable"
      : (phaseObservationFiles.length > 0 || artifacts.length > 0) ? "available" : "unavailable",
    measurementMode,
    phaseObservationComplete,
    artifactCount: phaseObservationFiles.length > 0 ? phaseObservationFiles.length : artifacts.length,
    authorArtifactCount,
    verifierArtifactCount,
    phaseRunManifestAvailable,
    phaseRuns,
    telemetryWarnings,
    observations,
    fixedContractReadDuplicatesExcluded: fixedContractReadDuplicates,
    fixedContractReadDuplicateEstimatedTokens:
      fixedContractReadDuplicates.reduce((sum, item) => sum + item.estimatedTokens, 0),
    observedEstimatedTokens: phaseObservationComplete === false
      ? null
      : observations.reduce((sum, item) => sum + item.estimatedTokens, 0),
  };
}

const args = parseArgs(process.argv.slice(2));
const phaseContracts = {
  orchestrator: measure(orchestratorFiles),
  authorInitial: measure(authorInitialFiles),
  authorRepair: measure(authorRepairFiles),
  verifierInitial: measure(verifierInitialFiles),
  verifierFinal: measure(verifierFinalFiles),
};
const staticWorkflowEstimatedTokens =
  phaseContracts.orchestrator.estimatedTokens +
  phaseContracts.authorInitial.estimatedTokens +
  phaseContracts.verifierInitial.estimatedTokens;
const result = {
  schemaVersion: 1,
  estimateKind: "visible-text-chars-divided-by-3.6",
  baselineFixedContractEstimatedTokens: 39284,
  phaseContracts,
  staticWorkflowEstimatedTokens,
  conditionalSkillEntryPoints: measure(conditionalEntryFiles),
};
result.staticWorkflowReductionPercent =
  Math.round(
    (1 - result.staticWorkflowEstimatedTokens / result.baselineFixedContractEstimatedTokens) *
      10000,
  ) / 100;
if (args.testProject) {
  result.runtime = runtimeEstimate(args.testProject, args.output, args.target);
  if (args.target) result.target = args.target;
  const countPhase = (phase, mode) =>
    result.runtime.phaseRuns.filter(
      (item) => item.phase === phase && item.mode === mode && item.status !== "running",
    ).length;
  result.phaseExecutions = {
    orchestrator: 1,
    authorInitial: result.runtime.phaseRunManifestAvailable
      ? countPhase("author", "initial")
      : Math.min(1, result.runtime.authorArtifactCount),
    authorRepair: result.runtime.phaseRunManifestAvailable
      ? countPhase("author", "repair")
      : 0,
    verifierInitial: result.runtime.phaseRunManifestAvailable
      ? countPhase("verifier", "initial")
      : Math.min(1, result.runtime.verifierArtifactCount),
    verifierFinal: result.runtime.phaseRunManifestAvailable
      ? countPhase("verifier", "final")
      : 0,
  };
  result.executedStaticWorkflowEstimatedTokens =
    phaseContracts.orchestrator.estimatedTokens +
    phaseContracts.authorInitial.estimatedTokens * result.phaseExecutions.authorInitial +
    phaseContracts.authorRepair.estimatedTokens * result.phaseExecutions.authorRepair +
    phaseContracts.verifierInitial.estimatedTokens * result.phaseExecutions.verifierInitial +
    phaseContracts.verifierFinal.estimatedTokens * result.phaseExecutions.verifierFinal;
  result.workflowObservedEstimatedTokens = result.runtime.status === "available"
    ? result.executedStaticWorkflowEstimatedTokens + result.runtime.observedEstimatedTokens
    : null;
}

if (args.output) {
  const outputPath = path.resolve(root, args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
