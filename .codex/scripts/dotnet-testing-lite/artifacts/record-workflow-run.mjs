#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const result = { command, preserve: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const value = rest[index + 1];
    if (key === "--output") result.output = value;
    else if (key === "--manifest") result.manifest = value;
    else if (key === "--target") result.target = value;
    else if (key === "--test-project") result.testProject = value;
    else if (key === "--status") result.status = value;
    else if (key === "--phase") result.phase = value;
    else if (key === "--mode") result.mode = value;
    else if (key === "--artifact") result.artifact = value;
    else if (key === "--preserve") result.preserve.push(value);
    // 舊呼叫相容：消耗參數但不讀取、不產生估算。
    else if (key === "--token-estimate") { /* retired */ }
    else throw new Error(`未知參數: ${key}`);
    index += 1;
  }
  return result;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveInputPath(value, testProjectPath) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("tokenEstimateInputs path 必須是非空字串");
  }
  if (path.isAbsolute(value)) return value;
  const fromRoot = path.resolve(value);
  return fs.existsSync(fromRoot)
    ? fromRoot
    : path.resolve(path.dirname(testProjectPath), value);
}

function measureFile(filePath) {
  const characters = fs.readFileSync(filePath, "utf8").length;
  return { path: filePath, characters };
}

function normalizeReadInput(value, testProjectPath) {
  const input = typeof value === "string" ? { path: value } : value;
  if (!input || !["pre-phase", "post-phase", undefined]
    .includes(input.measurementSource)) {
    throw new Error("readFiles.measurementSource 必須是 pre-phase 或 post-phase");
  }
  return {
    path: resolveInputPath(input.path, testProjectPath),
    measurementSource: input.measurementSource,
  };
}

function isDeterministicScriptSource(filePath) {
  const relative = path.relative(process.cwd(), path.resolve(filePath));
  return relative === "scripts" ||
    relative.startsWith(`scripts${path.sep}`) ||
    relative === path.join(".codex", "scripts") ||
    relative.startsWith(`${path.join(".codex", "scripts")}${path.sep}`);
}

function safeTargetName(value) {
  return value.replace(/[^\p{L}\p{N}_.-]/gu, "_");
}

function orchestratorRootFromManifest(manifestPath) {
  const manifestDirectory = path.dirname(manifestPath);
  return path.basename(manifestDirectory) === "runs"
    ? path.dirname(manifestDirectory)
    : manifestDirectory;
}

function captureObservation(manifestPath, manifest, args, run) {
  const artifactPath = path.resolve(args.artifact);
  if (!fs.existsSync(artifactPath)) throw new Error(`phase artifact 不存在: ${artifactPath}`);
  const artifactJson = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const inputs = artifactJson.tokenEstimateInputs;
  const warnings = [];
  const readFiles = Array.isArray(inputs?.readFiles) ? inputs.readFiles : [];
  const writtenFiles = Array.isArray(inputs?.writtenFiles) ? inputs.writtenFiles : [];
  if (!Array.isArray(inputs?.readFiles) || !Array.isArray(inputs?.writtenFiles)) {
    warnings.push("phase artifact 缺少完整 tokenEstimateInputs；以可用欄位記錄");
  }
  const artifactAccounting = ["agent-generated", "deterministic-copy", "deterministic-merge"]
    .includes(inputs?.artifactAccounting ?? "agent-generated")
    ? inputs?.artifactAccounting ?? "agent-generated"
    : "agent-generated";
  if (artifactAccounting !== (inputs?.artifactAccounting ?? "agent-generated")) {
    warnings.push("tokenEstimateInputs.artifactAccounting 無效；改用 agent-generated");
  }
  const prePhaseFiles = new Map(
    (run?.prePhaseFiles ?? []).map((item) => [path.resolve(item.path), item]),
  );
  const measureReadInputs = (values) => {
    const unique = new Map();
    for (const value of values) {
      const input = normalizeReadInput(value, manifest.testProjectPath);
      if (isDeterministicScriptSource(input.path)) {
        warnings.push(`排除 deterministic script telemetry: ${input.path}`);
        continue;
      }
      const prePhase = prePhaseFiles.get(path.resolve(input.path));
      if (input.measurementSource === "pre-phase" && !prePhase) {
        warnings.push(`pre-phase snapshot 不存在，改用 post-phase: ${input.path}`);
      }
      const measurementSource = input.measurementSource === "pre-phase" && !prePhase
        ? "post-phase"
        : input.measurementSource ??
        (prePhase ? "pre-phase" : "post-phase");
      unique.set(`${input.path}\0${measurementSource}`, {
        ...input,
        measurementSource,
      });
    }
    return [...unique.values()].map((input) => {
      const filePath = input.path;
      const prePhase = input.measurementSource === "pre-phase"
        ? prePhaseFiles.get(path.resolve(filePath))
        : null;
      if (prePhase) return { ...prePhase, measurementSource: "pre-phase" };
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        warnings.push(`略過不存在的 phase observation path: ${filePath}`);
        return null;
      }
      return { ...measureFile(filePath), measurementSource: "post-phase" };
    }).filter(Boolean);
  };
  const measureWrittenInputs = (values) => [...new Set(values.map((value) =>
    resolveInputPath(typeof value === "string" ? value : value?.path, manifest.testProjectPath),
  ))].map((filePath) => {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      warnings.push(`略過不存在的 phase observation path: ${filePath}`);
      return null;
    }
    return { ...measureFile(filePath), measurementSource: "post-phase" };
  }).filter(Boolean);
  const agentArtifactPath = artifactAccounting === "deterministic-merge"
    ? resolveInputPath(inputs.agentArtifactPath, manifest.testProjectPath)
    : null;
  if (agentArtifactPath &&
      (!fs.existsSync(agentArtifactPath) || !fs.statSync(agentArtifactPath).isFile())) {
    throw new Error(`agent artifact 不存在: ${agentArtifactPath}`);
  }
  const observation = {
    schemaVersion: 2,
    target: manifest.target,
    phase: args.phase,
    mode: args.mode,
    artifactAccounting,
    artifact: measureFile(artifactPath),
    ...(agentArtifactPath ? { agentArtifact: measureFile(agentArtifactPath) } : {}),
    readFiles: measureReadInputs(readFiles),
    writtenFiles: measureWrittenInputs(writtenFiles)
      .filter((item) =>
        path.resolve(item.path) !== artifactPath &&
        (!agentArtifactPath || path.resolve(item.path) !== agentArtifactPath)),
    warnings,
  };
  const observationPath = path.join(
    orchestratorRootFromManifest(manifestPath),
    "observations",
    safeTargetName(manifest.target),
    `${args.phase}-${args.mode}.json`,
  );
  fs.mkdirSync(path.dirname(observationPath), { recursive: true });
  fs.writeFileSync(
    observationPath,
    `${JSON.stringify(observation, null, 2)}\n`,
    { flag: "wx" },
  );
  return observationPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "start") {
    if (!args.output || !args.target || !args.testProject) {
      throw new Error("start 需要 --output、--target 與 --test-project");
    }
    const now = new Date();
    const manifest = {
      schemaVersion: 2,
      target: args.target,
      testProjectPath: path.resolve(args.testProject),
      topology: "Lite Orchestrator → Lite Unit Author → Lite Unit Verifier",
      startedAt: now.toISOString(),
      startedAtEpochMs: now.getTime(),
      status: "running",
      phaseRuns: [],
    };
    writeJson(path.resolve(args.output), manifest);
    console.log(JSON.stringify({ status: manifest.status, outputPath: path.resolve(args.output) }));
    return;
  }

  if (args.command === "phase") {
    if (!args.manifest || !args.phase || !args.mode || !args.status) {
      throw new Error("phase 需要 --manifest、--phase、--mode 與 --status");
    }
    if (!["author", "verifier"].includes(args.phase)) {
      throw new Error("--phase 必須是 author 或 verifier");
    }
    const manifestPath = path.resolve(args.manifest);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.phaseRuns ??= [];
    const now = new Date();
    if (args.status === "running") {
      const candidatePaths = [
        ...(args.artifact ? [args.artifact] : []),
        ...args.preserve,
      ].map((value) => path.resolve(value));
      const prePhaseFiles = [...new Set(candidatePaths)]
        .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
        .map(measureFile);
      manifest.phaseRuns.push({
        phase: args.phase,
        mode: args.mode,
        status: "running",
        startedAt: now.toISOString(),
        startedAtEpochMs: now.getTime(),
        ...(args.artifact ? { artifactPath: path.resolve(args.artifact) } : {}),
        prePhaseFiles,
      });
    } else {
      const run = [...manifest.phaseRuns]
        .reverse()
        .find(
          (item) =>
            item.phase === args.phase &&
            item.mode === args.mode &&
            item.status === "running",
        );
      if (run?.artifactPath && args.artifact &&
          path.resolve(args.artifact) !== path.resolve(run.artifactPath)) {
        throw new Error("phase completion artifact 與 running artifact 不一致");
      }
      const observationPath = args.artifact
        ? captureObservation(manifestPath, manifest, args, run)
        : null;
      if (run) {
        run.status = args.status;
        run.finishedAt = now.toISOString();
        run.durationMs = Math.max(0, now.getTime() - run.startedAtEpochMs);
        if (observationPath) run.observationPath = observationPath;
      } else {
        manifest.phaseRuns.push({
          phase: args.phase,
          mode: args.mode,
          status: args.status,
          recordedAt: now.toISOString(),
          durationMs: null,
          ...(observationPath ? { observationPath } : {}),
        });
      }
    }
    writeJson(manifestPath, manifest);
    console.log(JSON.stringify({
      status: "recorded",
      phase: args.phase,
      mode: args.mode,
      observationPath: args.status !== "running" && args.artifact
        ? path.join(
          orchestratorRootFromManifest(manifestPath),
          "observations",
          safeTargetName(manifest.target),
          `${args.phase}-${args.mode}.json`,
        )
        : null,
    }));
    return;
  }

  if (args.command === "finish") {
    if (!args.manifest || !args.status) {
      throw new Error("finish 需要 --manifest 與 --status");
    }
    const manifestPath = path.resolve(args.manifest);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const now = new Date();
    manifest.finishedAt = now.toISOString();
    manifest.durationMs = Math.max(0, now.getTime() - manifest.startedAtEpochMs);
    manifest.status = args.status;
    delete manifest.tokenUsage;
    writeJson(manifestPath, manifest);
    console.log(
      JSON.stringify({
        status: manifest.status,
        durationMs: manifest.durationMs,
        manifestPath,
      }),
    );
    return;
  }

  throw new Error("command 必須是 start、phase 或 finish");
}

try {
  main();
} catch (error) {
  console.error(`record-workflow-run error: ${error.message}`);
  process.exitCode = 1;
}
