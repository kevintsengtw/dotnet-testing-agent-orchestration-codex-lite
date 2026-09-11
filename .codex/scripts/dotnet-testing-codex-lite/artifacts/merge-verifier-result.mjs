#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] === "--coverage-base") result.base = argv[index + 1];
    else if (argv[index] === "--supplement") result.supplement = argv[index + 1];
    else if (argv[index] === "--output") result.output = argv[index + 1];
    else throw new Error(`未知參數: ${argv[index]}`);
  }
  if (!result.base || !result.supplement || !result.output) {
    throw new Error("--coverage-base, --supplement and --output are required");
  }
  return result;
}

const allowed = new Set([
  "schemaVersion",
  "quality",
  "qualityScore",
  "testValue",
  "coverageDecision",
  "blockerReview",
  "notSuitableReview",
  "decisionEvidence",
  "phaseIncidents",
  "tokenEstimateInputs",
]);
const input = args(process.argv.slice(2));
const base = JSON.parse(fs.readFileSync(input.base, "utf8"));
const supplement = JSON.parse(fs.readFileSync(input.supplement, "utf8"));
if (base.schemaVersion !== 1 || supplement.schemaVersion !== 1) {
  throw new Error("base and supplement schemaVersion must be 1");
}
const unexpected = Object.keys(supplement).filter((key) => !allowed.has(key));
if (unexpected.length > 0) throw new Error(`supplement contains deterministic fields: ${unexpected.join(",")}`);
const inputs = supplement.tokenEstimateInputs;
const supplementPhaseIncidents = Array.isArray(supplement.phaseIncidents)
  ? supplement.phaseIncidents : [];
const normalizedSupplement = {
  ...supplement,
  phaseIncidents: supplementPhaseIncidents,
  tokenEstimateInputs: {
    ...(inputs ?? {}),
    artifactAccounting: "deterministic-merge",
    agentArtifactPath: path.resolve(input.supplement),
    readFiles: Array.isArray(inputs?.readFiles) ? inputs.readFiles : [],
    writtenFiles: Array.isArray(inputs?.writtenFiles) ? inputs.writtenFiles : [],
  },
};
// Machine-confirmed failed build cannot become a semantic no-test or successful decision.
if (base.status === "build_failed" && base.build?.status === "failed" &&
    Number.isInteger(base.build.exitCode) && base.build.exitCode !== 0 && base.test === null) {
  if (normalizedSupplement.coverageDecision?.status !== "fail") {
    normalizedSupplement.phaseIncidents.push({ kind: "build_failure_decision_corrected",
      description: `Build 未成功且未執行 tests；將 review 建議 ${normalizedSupplement.coverageDecision?.status ?? 'missing'} 收斂為 fail，保留原始 build 證據。` });
  }
  normalizedSupplement.coverageDecision = { status: "fail", repairable: [], uncoverable: [] };
}
const outputPath = path.resolve(input.output);
const temporaryPath = `${outputPath}.merge.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify({ ...base, ...normalizedSupplement }, null, 2)}\n`, {
  flag: "wx",
});
fs.renameSync(temporaryPath, outputPath);
console.log(JSON.stringify({
  status: "merged",
  outputPath,
  agentIncidentCount: supplementPhaseIncidents.length,
}));
