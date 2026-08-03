#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { parseCobertura } from "./lib/cobertura.mjs";
import { parseTrxCounts } from "./lib/trx.mjs";
import { parseBuildWarnings } from "./lib/build-output.mjs";

function parseArgs(argv) {
  const args = { lineThreshold: 100, branchThreshold: 100 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--test-project") args.testProject = value;
    else if (key === "--target-source") args.targetSource = value;
    else if (key === "--target-class") args.targetClass = value;
    else if (key === "--output") args.output = value;
    else if (key === "--production-baseline") args.productionBaseline = value;
    else if (key === "--line-threshold") args.lineThreshold = Number(value);
    else if (key === "--branch-threshold") args.branchThreshold = Number(value);
    else if (key === "--help") args.help = true;
    else throw new Error(`未知參數: ${key}`);
    index += 1;
  }
  return args;
}

function usage() {
  return `Usage:
  node .codex/scripts/run-unit-coverage.mjs \\
    --test-project <tests.csproj> \\
    --target-source <source.cs> \\
    --target-class <ClassName> \\
    [--output <coverage.json>] \\
    [--production-baseline <baseline.json>] \\
    [--line-threshold 100] [--branch-threshold 100]`;
}

function tail(text, count = 30) {
  return text.trim().split(/\r?\n/).slice(-count).join("\n");
}

function runDotnet(args, cwd) {
  const result = spawnSync("dotnet", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
  };
}

function findFiles(directory, filename) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(fullPath, filename));
    else if (entry.name === filename) files.push(fullPath);
  }
  return files.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function testCounts(output) {
  const match = output.match(
    /Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)/i,
  );
  return match
    ? {
        failed: Number(match[1]),
        passed: Number(match[2]),
        skipped: Number(match[3]),
        total: Number(match[4]),
      }
    : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finish(manifest, status, startedAtMs) {
  manifest.status = status;
  manifest.finishedAt = new Date().toISOString();
  manifest.durationMs = Date.now() - startedAtMs;
}

function verifyProductionIntegrity(baselinePath) {
  if (!baselinePath) return { status: "not_checked" };
  const result = spawnSync(
    process.execPath,
    ["scripts/check-production-integrity.mjs", "verify", "--manifest", baselinePath],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  let details;
  try {
    details = JSON.parse(result.stdout);
  } catch {
    details = { errors: [(result.stderr || result.stdout || "integrity check failed").trim()] };
  }
  return {
    status: result.status === 0 ? "passed" : "failed",
    baselinePath: path.resolve(baselinePath),
    ...details,
  };
}

function main() {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  for (const name of ["testProject", "targetSource", "targetClass"]) {
    if (!args[name]) throw new Error(`缺少 --${name.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}`);
  }

  const repoRoot = process.cwd();
  const testProject = path.resolve(repoRoot, args.testProject);
  const targetSource = path.resolve(repoRoot, args.targetSource);
  const testProjectDir = path.dirname(testProject);
  const safeTarget = args.targetClass.replace(/[^\p{L}\p{N}_.-]/gu, "_");
  const outputPath = path.resolve(
    repoRoot,
    args.output ?? path.join(testProjectDir, ".orchestrator", "verification", `${safeTarget}.coverage.json`),
  );
  const rawDirectory = path.join(testProjectDir, ".orchestrator", "coverage", safeTarget);
  fs.rmSync(rawDirectory, { recursive: true, force: true });
  fs.mkdirSync(rawDirectory, { recursive: true });

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt,
    target: { className: args.targetClass, sourcePath: targetSource },
    testProjectPath: testProject,
    thresholds: { line: args.lineThreshold, branch: args.branchThreshold },
    build: null,
    test: null,
    coverage: null,
    productionIntegrity: null,
    status: "started",
  };

  const buildStartedAtMs = Date.now();
  const build = runDotnet(
    ["build", testProject, "--no-incremental", "--verbosity", "minimal"],
    repoRoot,
  );
  manifest.build = {
    status: build.exitCode === 0 ? "passed" : "failed",
    exitCode: build.exitCode,
    durationMs: Date.now() - buildStartedAtMs,
    warnings: parseBuildWarnings(build.output),
    ...(build.exitCode === 0 ? {} : { outputTail: tail(build.output) }),
  };
  if (build.exitCode !== 0) {
    manifest.productionIntegrity = verifyProductionIntegrity(args.productionBaseline);
    finish(
      manifest,
      manifest.productionIntegrity.status === "failed" ? "production_modified" : "build_failed",
      startedAtMs,
    );
    writeJson(outputPath, manifest);
    process.exitCode = 1;
    return;
  }

  const testStartedAtMs = Date.now();
  const test = runDotnet(
    [
      "test",
      testProject,
      "--no-build",
      "--verbosity",
      "minimal",
      '--collect:XPlat Code Coverage',
      "--results-directory",
      rawDirectory,
      "--logger",
      "trx;LogFileName=test-results.trx",
    ],
    repoRoot,
  );
  const trxPath = findFiles(rawDirectory, "test-results.trx")[0];
  manifest.test = {
    status: test.exitCode === 0 ? "passed" : "failed",
    exitCode: test.exitCode,
    durationMs: Date.now() - testStartedAtMs,
    counts: trxPath
      ? parseTrxCounts(fs.readFileSync(trxPath, "utf8"))
      : testCounts(test.output),
    ...(trxPath ? { trxPath } : {}),
    ...(test.exitCode === 0 ? {} : { outputTail: tail(test.output) }),
  };
  if (test.exitCode !== 0) {
    manifest.productionIntegrity = verifyProductionIntegrity(args.productionBaseline);
    finish(
      manifest,
      manifest.productionIntegrity.status === "failed" ? "production_modified" : "test_failed",
      startedAtMs,
    );
    writeJson(outputPath, manifest);
    process.exitCode = 1;
    return;
  }

  const coveragePath = findFiles(rawDirectory, "coverage.cobertura.xml")[0];
  if (!coveragePath) {
    manifest.productionIntegrity = verifyProductionIntegrity(args.productionBaseline);
    manifest.coverage = { error: "coverage.cobertura.xml not found" };
    finish(
      manifest,
      manifest.productionIntegrity.status === "failed" ? "production_modified" : "coverage_unavailable",
      startedAtMs,
    );
    writeJson(outputPath, manifest);
    process.exitCode = 2;
    return;
  }

  try {
    const coverage = parseCobertura(fs.readFileSync(coveragePath, "utf8"), {
      targetSource,
      targetClass: args.targetClass,
    });
    manifest.coverage = { reportPath: coveragePath, ...coverage };
    manifest.goal = {
      met:
        coverage.line.percent >= args.lineThreshold &&
        coverage.branch.percent >= args.branchThreshold,
      lineMet: coverage.line.percent >= args.lineThreshold,
      branchMet: coverage.branch.percent >= args.branchThreshold,
    };
    manifest.productionIntegrity = verifyProductionIntegrity(args.productionBaseline);
    finish(
      manifest,
      manifest.productionIntegrity.status === "failed"
        ? "production_modified"
        : manifest.goal.met ? "coverage_complete" : "coverage_gap",
      startedAtMs,
    );
    writeJson(outputPath, manifest);
    console.log(
      JSON.stringify({
        status: manifest.status,
        outputPath,
        tests: manifest.test.counts,
        line: coverage.line.percent,
        branch: coverage.branch.percent,
        uncoveredLines: coverage.line.uncoveredLines.length,
        uncoveredBranches: coverage.branch.uncoveredBranches.length,
      }),
    );
    if (manifest.productionIntegrity.status === "failed") process.exitCode = 1;
  } catch (error) {
    manifest.productionIntegrity = verifyProductionIntegrity(args.productionBaseline);
    manifest.coverage = { reportPath: coveragePath, error: error.message };
    finish(
      manifest,
      manifest.productionIntegrity.status === "failed" ? "production_modified" : "coverage_unavailable",
      startedAtMs,
    );
    writeJson(outputPath, manifest);
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error(`run-unit-coverage error: ${error.message}`);
  console.error(usage());
  process.exitCode = 2;
}
