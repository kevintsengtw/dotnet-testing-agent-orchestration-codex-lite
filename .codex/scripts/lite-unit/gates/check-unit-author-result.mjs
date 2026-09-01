#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectTestMethods } from "../lib/test-source-analysis.mjs";

const statuses = new Set(["completed", "partial", "no_valuable_tests", "blocked"]);
const scenarioStatuses = new Set(["implemented", "rejected", "blocked"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveArtifactPath(value, artifactPath) {
  if (!nonEmpty(value)) return null;
  if (path.isAbsolute(value)) return path.resolve(value);
  const fromRoot = path.resolve(value);
  return fs.existsSync(fromRoot) ? fromRoot : path.resolve(path.dirname(artifactPath), value);
}

function validateIncidents(value, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push("phaseIncidents must be an array");
    return;
  }
  for (const [index, incident] of value.entries()) {
    if (!incident || typeof incident !== "object" || !nonEmpty(incident.kind)) {
      errors.push(`phaseIncidents[${index}] requires a non-empty kind`);
    }
  }
}

function validateFiles(result, artifactPath, errors) {
  if (!Array.isArray(result.testFilePaths)) {
    errors.push("testFilePaths must be an array");
    return [];
  }
  const files = result.testFilePaths.map((value) => resolveArtifactPath(value, artifactPath));
  for (const [index, file] of files.entries()) {
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      errors.push(`testFilePaths[${index}] must reference an existing file`);
    }
  }
  return files.filter(Boolean);
}

function validateInitial(result, artifactPath, errors) {
  const noTest = result.status === "no_valuable_tests" || result.status === "blocked";
  const files = validateFiles(result, artifactPath, errors);
  if (noTest && files.length !== 0) errors.push(`${result.status} requires empty testFilePaths`);
  if (!noTest && files.length === 0) errors.push(`${result.status} requires testFilePaths`);

  if (result.scenarioPlan !== undefined && !Array.isArray(result.scenarioPlan)) {
    errors.push("scenarioPlan must be an array when present");
  }
  const scenarios = Array.isArray(result.scenarioPlan) ? result.scenarioPlan : [];
  if (noTest) {
    for (const [index, scenario] of scenarios.entries()) {
      if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
        errors.push(`scenarioPlan[${index}] must be an object`);
      }
    }
  } else {
    if (scenarios.length === 0) errors.push("initial test delivery requires scenarioPlan");
    const ids = new Set();
    const mappedMethods = new Set();
    for (const [index, scenario] of scenarios.entries()) {
      const prefix = `scenarioPlan[${index}]`;
      for (const field of ["id", "expectedBehavior", "oracle", "failureMode", "testMethod"]) {
        if (!nonEmpty(scenario?.[field])) errors.push(`${prefix}.${field} is required`);
      }
      if (nonEmpty(scenario?.id)) {
        if (ids.has(scenario.id)) errors.push(`${prefix}.id must be unique`);
        ids.add(scenario.id);
      }
      if (nonEmpty(scenario?.testMethod)) mappedMethods.add(scenario.testMethod);
    }
    const actualMethods = new Set(files.flatMap((file) => (
      fs.existsSync(file)
        ? collectTestMethods(fs.readFileSync(file, "utf8")).map((item) => item.name)
        : []
    )));
    for (const method of mappedMethods) {
      if (!actualMethods.has(method)) errors.push(`scenario testMethod not found in C# source: ${method}`);
    }
    for (const method of actualMethods) {
      if (!mappedMethods.has(method)) errors.push(`C# test method is missing scenario mapping: ${method}`);
    }
  }
  if (noTest && (!result.decisionEvidence || typeof result.decisionEvidence !== "object")) {
    errors.push(`${result.status} requires decisionEvidence`);
  }
}

function validateRepair(result, artifactPath, errors) {
  if (!new Set(["completed", "partial"]).has(result.status)) {
    errors.push("repair status must be completed or partial");
  }
  const files = validateFiles(result, artifactPath, errors);
  if (files.length === 0) errors.push("repair requires testFilePaths");
  if (result.repairedGapIds !== undefined && !Array.isArray(result.repairedGapIds)) {
    errors.push("repair repairedGapIds must be an array when present");
  }
  if (result.changes !== undefined && !Array.isArray(result.changes)) {
    errors.push("repair changes must be an array when present");
  }
}

function validateUserScenarios(result, manifestPath, errors) {
  if (!manifestPath) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const expected = new Set((manifest.scenarios ?? []).map((item) => item.id));
  const coverage = Array.isArray(result.scenarioCoverage) ? result.scenarioCoverage : [];
  const seen = new Set();
  const methods = new Set((Array.isArray(result.scenarioPlan) ? result.scenarioPlan : [])
    .map((item) => item?.testMethod));
  for (const [index, item] of coverage.entries()) {
    const prefix = `scenarioCoverage[${index}]`;
    if (!expected.has(item?.id)) errors.push(`${prefix}.id is not in user scenario manifest`);
    else if (seen.has(item.id)) errors.push(`${prefix}.id must be unique`);
    else seen.add(item.id);
    if (!scenarioStatuses.has(item?.status)) errors.push(`${prefix}.status is invalid`);
    if (item?.status === "implemented" && !methods.has(item?.testMethod)) {
      errors.push(`${prefix}.testMethod must reference scenarioPlan`);
    }
    if (item?.status !== "implemented" && !nonEmpty(item?.reason)) {
      errors.push(`${prefix}.reason is required`);
    }
  }
  for (const id of expected) {
    if (!seen.has(id)) errors.push(`missing user scenario disposition: ${id}`);
  }
}

function validate(result, artifactPath, userScenariosPath) {
  const errors = [];
  if (result.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!statuses.has(result.status)) errors.push("status is invalid");
  if (!new Set(["initial", "repair"]).has(result.mode)) errors.push("mode is invalid");
  validateIncidents(result.phaseIncidents, errors);
  if (result.testOnlyIssues !== undefined && !Array.isArray(result.testOnlyIssues)) {
    errors.push("testOnlyIssues must be an array when present");
  }
  if (result.mode === "repair") validateRepair(result, artifactPath, errors);
  else {
    validateInitial(result, artifactPath, errors);
    validateUserScenarios(result, userScenariosPath, errors);
  }
  return errors;
}

const argv = process.argv.slice(2);
const artifactPath = argv[0];
const scenarioIndex = argv.indexOf("--user-scenarios");
const userScenariosPath = scenarioIndex >= 0 ? argv[scenarioIndex + 1] : null;
if (!artifactPath || !fs.existsSync(artifactPath)) {
  console.error("author result not found");
  process.exit(1);
}
try {
  const result = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const errors = validate(result, artifactPath, userScenariosPath);
  if (errors.length > 0) throw new Error(errors.join("; "));
  console.log(JSON.stringify({ status: "valid", artifactPath: path.resolve(artifactPath) }));
} catch (error) {
  console.error(`author result invalid: ${error.message}`);
  process.exitCode = 1;
}
