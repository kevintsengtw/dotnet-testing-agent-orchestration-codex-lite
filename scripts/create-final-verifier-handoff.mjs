#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--author-result") result.authorResult = value;
    else if (key === "--verification") result.verification = value;
    else if (key === "--repair-manifest") result.repairManifest = value;
    else if (key === "--output") result.output = value;
    else throw new Error(`未知參數: ${key}`);
  }
  for (const key of ["authorResult", "verification", "repairManifest", "output"]) {
    if (!result[key]) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function source(filePath) {
  const resolved = path.resolve(filePath);
  return {
    path: resolved,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(resolved)).digest("hex"),
  };
}

const args = parseArgs(process.argv.slice(2));
const author = readJson(args.authorResult);
const verification = readJson(args.verification);
const repair = readJson(args.repairManifest);
if (author.status !== "completed") throw new Error("author result must be completed");
if (repair.testDeliveryGap?.kind !== "project-config" ||
    repair.testDeliveryGap?.phase !== "build" ||
    (repair.coverageGaps?.length ?? 0) !== 0 ||
    (repair.qualityGaps?.length ?? 0) !== 0) {
  throw new Error("handoff only supports project-config-only build repair");
}
if (verification.isFinal !== false ||
    verification.repairEligibility?.status !== "eligible" ||
    verification.repairEligibility?.scope !== "test-delivery" ||
    verification.repairEligibility?.failedPhase !== "build") {
  throw new Error("initial verification is not an eligible build repair");
}

const handoff = {
  schemaVersion: 1,
  kind: "project-config-final-review",
  target: author.target,
  sources: {
    authorResult: source(args.authorResult),
    initialVerification: source(args.verification),
    repairManifest: source(args.repairManifest),
  },
  testProjectPath: author.testProjectPath,
  testFilePaths: author.testFilePaths,
  scenarioCount: author.scenarioCount,
  testMethodCount: author.testMethodCount,
  scenarios: author.scenarioPlan.map((item) => ({
    id: item.id,
    expectedBehavior: item.expectedBehavior,
    oracle: item.oracle,
    valueCategory: item.valueCategory,
    failureMode: item.failureMode,
    testMethod: item.testMethod,
  })),
  inventory: author.contractInventory.map((item) => ({
    id: item.id,
    behavior: item.behavior,
    kind: item.kind,
    status: item.status,
    scenarioIds: item.scenarioIds,
    ...(item.reason ? { reason: item.reason } : {}),
  })),
  audit: author.completenessAudit,
  userScenarios: author.scenarioCoverage,
  initialFailure: {
    status: verification.status,
    repairEligibility: verification.repairEligibility,
  },
  deliveryGap: repair.testDeliveryGap,
};
const outputPath = path.resolve(args.output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(handoff)}\n`, { flag: "wx" });
console.log(JSON.stringify({
  status: "created",
  outputPath,
  characters: fs.statSync(outputPath).size,
  scenarioCount: handoff.scenarioCount,
}));
