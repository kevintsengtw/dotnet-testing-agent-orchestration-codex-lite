#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);
const manifestIndex = argv.indexOf("--manifest");
const manifestPath = manifestIndex >= 0 ? argv[manifestIndex + 1] : null;
if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error("validate-result error: manifest not found");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const decisions = new Set([
  "pass", "needs_repair", "best_effort", "fail", "blocked", "not_suitable", "tool_incident",
]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateIncidents(value, field) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  for (const [index, incident] of value.entries()) {
    if (!incident || typeof incident !== "object" || !nonEmpty(incident.kind)) {
      errors.push(`${field}[${index}] requires a non-empty kind`);
    }
  }
}

function validateCounts(counts) {
  if (!counts || typeof counts !== "object") {
    errors.push("test.counts is required when tests ran");
    return;
  }
  for (const field of ["total", "passed", "failed", "skipped"]) {
    if (!Number.isInteger(counts[field]) || counts[field] < 0) {
      errors.push(`test.counts.${field} must be a non-negative integer`);
    }
  }
  if (counts.executed !== undefined &&
      (!Number.isInteger(counts.executed) || counts.executed < 0)) {
    errors.push("test.counts.executed must be a non-negative integer when present");
  }
  if (Number.isInteger(counts.total) && Number.isInteger(counts.passed) &&
      Number.isInteger(counts.failed) && Number.isInteger(counts.skipped) &&
      counts.passed + counts.failed + counts.skipped !== counts.total) {
    errors.push("test counts must reconcile");
  }
}

function validateMetric(metric, name) {
  if (!metric || typeof metric !== "object") {
    errors.push(`coverage.${name} is required`);
    return;
  }
  if (!Number.isFinite(metric.percent) || metric.percent < 0 || metric.percent > 100) {
    errors.push(`coverage.${name}.percent must be between 0 and 100`);
  }
  if (Number.isFinite(metric.covered) && Number.isFinite(metric.total) && metric.covered > metric.total) {
    errors.push(`coverage.${name}.covered must not exceed total`);
  }
}

function validateRepairManifest(decision) {
  if (decision !== "needs_repair") return;
  if (manifest.isFinal === true) errors.push("final verification cannot request repair");
  if (!manifest.repairManifestPath || !fs.existsSync(manifest.repairManifestPath)) {
    errors.push("needs_repair requires an existing repairManifestPath");
    return;
  }
  try {
    const repair = JSON.parse(fs.readFileSync(manifest.repairManifestPath, "utf8"));
    if (repair.schemaVersion !== 1) errors.push("repair manifest schemaVersion must be 1");
    for (const field of ["coverageGaps", "qualityGaps"]) {
      if (repair[field] !== undefined && !Array.isArray(repair[field])) {
        errors.push(`repair manifest ${field} must be an array when present`);
      }
    }
    const gaps = [
      ...(Array.isArray(repair.coverageGaps) ? repair.coverageGaps : []),
      ...(Array.isArray(repair.qualityGaps) ? repair.qualityGaps : []),
      ...(repair.testDeliveryGap ? [repair.testDeliveryGap] : []),
    ];
    if (gaps.length === 0) errors.push("repair manifest requires at least one finite gap");
    for (const [index, gap] of gaps.entries()) {
      if (!gap || typeof gap !== "object") {
        errors.push(`repair gap ${index} must be an object`);
        continue;
      }
      for (const field of ["id", "reason", "action"]) {
        if (!nonEmpty(gap[field])) errors.push(`repair gap ${index}.${field} is required`);
      }
    }
  } catch (error) {
    errors.push(`repair manifest is invalid: ${error.message}`);
  }
}

if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
validateIncidents(manifest.phaseIncidents, "phaseIncidents");
if (Array.isArray(manifest.runnerIncidents)) validateIncidents(manifest.runnerIncidents, "runnerIncidents");
if (manifest.productionIntegrity?.status !== "passed") errors.push("productionIntegrity must pass");
if (!Number.isFinite(manifest.durationMs) || manifest.durationMs < 0) {
  errors.push("durationMs must be a non-negative number");
}

const decision = manifest.coverageDecision?.status;
if (!decisions.has(decision)) errors.push("coverageDecision.status is invalid");
if (!Array.isArray(manifest.coverageDecision?.repairable)) {
  errors.push("coverageDecision.repairable must be an array");
}
if (!Array.isArray(manifest.coverageDecision?.uncoverable)) {
  errors.push("coverageDecision.uncoverable must be an array");
}
if (typeof manifest.isFinal !== "boolean") errors.push("isFinal must be boolean");
if (!manifest.quality || !Array.isArray(manifest.quality.issues)) {
  errors.push("quality.issues must be an array");
}
if (!manifest.testValue || typeof manifest.testValue !== "object") {
  errors.push("testValue review is required");
}

const noTest = decision === "blocked" || decision === "not_suitable";
if (noTest) {
  if (manifest.build?.status !== "not_run" || manifest.test?.status !== "not_run") {
    errors.push(`${decision} must not run build or tests`);
  }
  if (manifest.coverage?.status !== "not_applicable") {
    errors.push(`${decision} coverage must be not_applicable`);
  }
  if (manifest.isFinal !== true) errors.push(`${decision} must be final`);
  if (!manifest.decisionEvidence && !manifest.blockerReview && !manifest.notSuitableReview) {
    errors.push(`${decision} requires semantic decision evidence`);
  }
} else {
  if (!new Set(["passed", "failed"]).has(manifest.build?.status)) {
    errors.push("build.status must be passed or failed");
  }
  if (!new Set(["passed", "failed", "not_run"]).has(manifest.test?.status)) {
    errors.push("test.status is invalid");
  }
  if (manifest.test?.status !== "not_run") validateCounts(manifest.test.counts);
  if (manifest.build?.status === "passed" && manifest.test?.status === "passed" &&
      decision !== "tool_incident") {
    validateMetric(manifest.coverage?.line, "line");
    validateMetric(manifest.coverage?.branch, "branch");
  }
  if (decision === "pass") {
    if (manifest.build?.status !== "passed" || manifest.test?.status !== "passed") {
      errors.push("pass requires successful build and test");
    }
    if (manifest.goal?.met !== true) errors.push("pass requires coverage goal met");
  }
  if (decision === "best_effort") {
    if (manifest.build?.status !== "passed" || manifest.test?.status !== "passed") {
      errors.push("best_effort requires successful build and test");
    }
    if (manifest.goal?.met === true) errors.push("best_effort requires unmet coverage goal");
    if ((manifest.coverageDecision?.uncoverable?.length ?? 0) === 0) {
      errors.push("best_effort requires an important uncoverable gap");
    }
  }
}
validateRepairManifest(decision);

if (errors.length > 0) {
  console.error(`validate-result error: ${errors.join("; ")}`);
  process.exit(1);
}
console.log(JSON.stringify({
  status: "valid",
  decision,
  manifestPath: path.resolve(manifestPath),
}));
