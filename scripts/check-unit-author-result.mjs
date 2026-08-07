#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectTestMethods } from "./test-source-analysis.mjs";

const requiredDimensions = [
  "public-behaviors",
  "defaults",
  "boundaries",
  "branches",
  "rule-precedence",
  "state-side-effects",
  "implementation-detail-review",
];
const validCategories = new Set(["happy", "boundary", "exception", "branch", "state", "characterization"]);
const validPriorities = new Set(["P0", "P1", "P2"]);
const validSources = new Set(["user", "documentation", "public-contract", "source-characterization"]);
const validImplementationDetailSources = new Set(["user", "documentation", "public-contract"]);
const validDimensionStatuses = new Set(["covered", "reviewed", "not-applicable"]);
const validInventoryKinds = new Set([
  "input-partition",
  "mapping-field",
  "fallback",
  "rule-precedence",
  "interaction",
  "cancellation",
  "state-output",
  "exception",
]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveArtifactPath(filePath, inputPath) {
  if (!nonEmptyString(filePath)) return null;
  if (path.isAbsolute(filePath)) return filePath;
  const fromRoot = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return path.resolve(path.dirname(inputPath), filePath);
}

function validate(result, inputPath) {
  const errors = [];
  if (result.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  const noValuableTests = result.status === "no_valuable_tests";
  const blocked = result.status === "blocked";
  const emptyDelivery = noValuableTests || blocked;
  const partial = result.status === "partial";
  if (!["completed", "partial", "no_valuable_tests", "blocked"].includes(result.status)) {
    errors.push("status must be completed, partial, no_valuable_tests, or blocked");
  }
  for (const field of ["totalTests", "passedTests", "failedTests", "fixRounds"]) {
    if (!Number.isInteger(result[field]) || result[field] < 0) {
      errors.push(`${field} must be a non-negative integer`);
    }
  }
  if (Number.isInteger(result.fixRounds) && result.fixRounds > 3) {
    errors.push("fixRounds must not exceed 3");
  }
  if (
    Number.isInteger(result.totalTests) &&
    Number.isInteger(result.passedTests) &&
    Number.isInteger(result.failedTests) &&
    result.passedTests + result.failedTests > result.totalTests
  ) {
    errors.push("passedTests + failedTests must not exceed totalTests");
  }
  const failedTestDetails = Array.isArray(result.failedTestDetails)
    ? result.failedTestDetails
    : [];
  if (!Array.isArray(result.failedTestDetails)) {
    errors.push("failedTestDetails must be an array");
  }
  for (const [index, detail] of failedTestDetails.entries()) {
    for (const field of ["testName", "message"]) {
      if (!nonEmptyString(detail?.[field])) {
        errors.push(`failedTestDetails[${index}].${field} must be a non-empty string`);
      }
    }
  }
  if (result.status === "completed") {
    if (result.totalTests <= 0 || result.passedTests !== result.totalTests || result.failedTests !== 0) {
      errors.push("completed requires every executed test to pass");
    }
    if (failedTestDetails.length !== 0) {
      errors.push("completed requires empty failedTestDetails");
    }
  }
  if (partial) {
    if (result.fixRounds !== 3) errors.push("partial requires exactly 3 fixRounds");
    if (failedTestDetails.length === 0) {
      errors.push("partial requires failedTestDetails from the final dotnet test output");
    }
  }
  if (emptyDelivery) {
    if (
      result.totalTests !== 0 ||
      result.passedTests !== 0 ||
      result.failedTests !== 0 ||
      result.fixRounds !== 0
    ) {
      errors.push(`${result.status} requires zero execution counts`);
    }
    if (failedTestDetails.length !== 0) {
      errors.push(`${result.status} requires empty failedTestDetails`);
    }
  }
  if (typeof result.testProjectCreated !== "boolean") {
    errors.push("testProjectCreated must be boolean");
  }
  const testProjectPath = resolveArtifactPath(result.testProjectPath, inputPath);
  if (
    !testProjectPath ||
    path.extname(testProjectPath).toLowerCase() !== ".csproj" ||
    !fs.existsSync(testProjectPath) ||
    !fs.statSync(testProjectPath).isFile()
  ) {
    errors.push("testProjectPath must reference an existing csproj");
  }
  const testProjectDirectory = testProjectPath ? path.dirname(testProjectPath) : null;

  const scenarios = Array.isArray(result.scenarioPlan) ? result.scenarioPlan : [];
  if (!emptyDelivery && scenarios.length === 0) errors.push("scenarioPlan must not be empty");
  if (noValuableTests && scenarios.length !== 0) {
    errors.push("no_valuable_tests requires an empty scenarioPlan");
  }
  if (blocked && scenarios.length !== 0) errors.push("blocked requires an empty scenarioPlan");
  if (result.scenarioCount !== scenarios.length) {
    errors.push("scenarioCount must equal scenarioPlan length");
  }

  const scenarioIds = new Set();
  for (const [index, scenario] of scenarios.entries()) {
    const prefix = `scenarioPlan[${index}]`;
    for (const field of ["id", "expectedBehavior", "coveredRule", "oracle", "testMethod"]) {
      if (!nonEmptyString(scenario[field])) errors.push(`${prefix}.${field} must be a non-empty string`);
    }
    if (!["contract", "characterization"].includes(scenario.valueCategory)) {
      errors.push(`${prefix}.valueCategory is invalid`);
    }
    if (!nonEmptyString(scenario.failureMode)) {
      errors.push(`${prefix}.failureMode must be a non-empty string`);
    }
    if (nonEmptyString(scenario.id)) {
      if (scenarioIds.has(scenario.id)) errors.push(`${prefix}.id must be unique`);
      scenarioIds.add(scenario.id);
    }
    if (!validCategories.has(scenario.category)) errors.push(`${prefix}.category is invalid`);
    if (!validPriorities.has(scenario.priority)) errors.push(`${prefix}.priority is invalid`);
    if (!validSources.has(scenario.requirementSource)) errors.push(`${prefix}.requirementSource is invalid`);
    if (scenario.responsibility != null && scenario.responsibility !== "target") {
      errors.push(`${prefix}.responsibility must be target`);
    }
    if (scenario.implementationDetail != null && typeof scenario.implementationDetail !== "boolean") {
      errors.push(`${prefix}.implementationDetail must be boolean`);
    } else if (scenario.implementationDetail && !nonEmptyString(scenario.implementationDetailReason)) {
      errors.push(`${prefix}.implementationDetailReason is required when implementationDetail is true`);
    } else if (
      scenario.implementationDetail &&
      !validImplementationDetailSources.has(scenario.requirementSource)
    ) {
      errors.push(`${prefix}.requirementSource cannot justify an implementation detail`);
    }
  }

  const inventory = Array.isArray(result.contractInventory) ? result.contractInventory : [];
  if (!emptyDelivery && inventory.length === 0) {
    errors.push("contractInventory must not be empty");
  }
  if (noValuableTests && inventory.length !== 0) {
    errors.push("no_valuable_tests requires an empty contractInventory");
  }
  if (blocked && inventory.length !== 0) {
    errors.push("blocked requires an empty contractInventory");
  }
  const inventoryIds = new Set();
  for (const [index, item] of inventory.entries()) {
    const prefix = `contractInventory[${index}]`;
    if (!nonEmptyString(item?.id)) {
      errors.push(`${prefix}.id must be a non-empty string`);
    } else if (inventoryIds.has(item.id)) {
      errors.push(`${prefix}.id must be unique`);
    } else {
      inventoryIds.add(item.id);
    }
    if (!validInventoryKinds.has(item?.kind)) errors.push(`${prefix}.kind is invalid`);
    if (!nonEmptyString(item?.behavior)) errors.push(`${prefix}.behavior must be non-empty`);
    if (!validDimensionStatuses.has(item?.status)) errors.push(`${prefix}.status is invalid`);
    const ids = Array.isArray(item?.scenarioIds) ? item.scenarioIds : [];
    for (const id of ids) {
      if (!scenarioIds.has(id)) errors.push(`${prefix}.scenarioIds contains unknown id: ${id}`);
    }
    if (item?.status === "covered" && ids.length === 0) {
      errors.push(`${prefix}.scenarioIds is required when status is covered`);
    }
    if (item?.status !== "covered" && !nonEmptyString(item?.reason)) {
      errors.push(`${prefix}.reason is required when status is ${item?.status}`);
    }
  }

  const audit = result.completenessAudit;
  if (!audit || typeof audit !== "object") {
    errors.push("completenessAudit is required");
    return errors;
  }
  if (audit.status !== "complete") errors.push("completenessAudit.status must be complete");
  if (!Array.isArray(audit.unresolved) || audit.unresolved.length !== 0) {
    errors.push("completenessAudit.unresolved must be an empty array");
  }
  if (!Array.isArray(audit.excludedResponsibilities)) {
    errors.push("completenessAudit.excludedResponsibilities must be an array");
  } else {
    for (const [index, item] of audit.excludedResponsibilities.entries()) {
      for (const field of ["behavior", "owner", "reason"]) {
        if (!nonEmptyString(item?.[field])) {
          errors.push(`completenessAudit.excludedResponsibilities[${index}].${field} must be non-empty`);
        }
      }
    }
  }

  const dimensions = Array.isArray(audit.dimensions) ? audit.dimensions : [];
  const seenDimensions = new Set();
  for (const [index, dimension] of dimensions.entries()) {
    const prefix = `completenessAudit.dimensions[${index}]`;
    if (!requiredDimensions.includes(dimension.name)) {
      errors.push(`${prefix}.name is invalid`);
      continue;
    }
    if (seenDimensions.has(dimension.name)) errors.push(`${prefix}.name must be unique`);
    seenDimensions.add(dimension.name);
    if (!validDimensionStatuses.has(dimension.status)) errors.push(`${prefix}.status is invalid`);

    const ids = Array.isArray(dimension.scenarioIds) ? dimension.scenarioIds : [];
    for (const id of ids) {
      if (!scenarioIds.has(id)) errors.push(`${prefix}.scenarioIds contains unknown id: ${id}`);
    }
    if (dimension.status === "covered" && ids.length === 0) {
      errors.push(`${prefix}.scenarioIds is required when status is covered`);
    }
    if (dimension.status !== "covered" && !nonEmptyString(dimension.reason)) {
      errors.push(`${prefix}.reason is required when status is ${dimension.status}`);
    }
  }

  for (const name of requiredDimensions) {
    if (!seenDimensions.has(name)) errors.push(`missing completeness dimension: ${name}`);
  }
  const uniqueTestMethods = new Set(scenarios.map((scenario) => scenario.testMethod).filter(nonEmptyString));
  if (result.testMethodCount !== uniqueTestMethods.size) {
    errors.push("testMethodCount must equal unique scenario testMethod count");
  }
  const testFilePaths = Array.isArray(result.testFilePaths) ? result.testFilePaths : [];
  if (!emptyDelivery && testFilePaths.length === 0) errors.push("testFilePaths must not be empty");
  if (noValuableTests && testFilePaths.length !== 0) {
    errors.push("no_valuable_tests requires empty testFilePaths");
  }
  if (blocked && testFilePaths.length !== 0) errors.push("blocked requires empty testFilePaths");
  const actualTestMethods = new Set();
  for (const [index, value] of testFilePaths.entries()) {
    const filePath = resolveArtifactPath(value, inputPath);
    if (!filePath || !fs.existsSync(filePath)) {
      errors.push(`testFilePaths[${index}] does not exist`);
      continue;
    }
    const relativeToProject = testProjectDirectory
      ? path.relative(testProjectDirectory, filePath)
      : "..";
    if (
      relativeToProject === ".." ||
      relativeToProject.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToProject)
    ) {
      errors.push(`testFilePaths[${index}] must be inside the test project directory`);
    }
    for (const method of collectTestMethods(fs.readFileSync(filePath, "utf8"))) {
      actualTestMethods.add(method.name);
    }
  }
  if (result.testMethodCount !== actualTestMethods.size) {
    errors.push("testMethodCount must equal actual C# test method count");
  }
  for (const method of uniqueTestMethods) {
    if (!actualTestMethods.has(method)) errors.push(`scenario testMethod not found in C# source: ${method}`);
  }
  for (const method of actualTestMethods) {
    if (!uniqueTestMethods.has(method)) errors.push(`C# test method is missing scenario mapping: ${method}`);
  }
  if (noValuableTests) {
    const review = result.noValuableTests;
    if (!nonEmptyString(review?.reason)) {
      errors.push("noValuableTests.reason is required");
    }
    const candidates = Array.isArray(review?.candidateBehaviors)
      ? review.candidateBehaviors
      : [];
    if (candidates.length === 0) {
      errors.push("noValuableTests.candidateBehaviors must not be empty");
    }
    for (const [index, candidate] of candidates.entries()) {
      const prefix = `noValuableTests.candidateBehaviors[${index}]`;
      if (!nonEmptyString(candidate?.behavior)) errors.push(`${prefix}.behavior is required`);
      if (!["unobservable", "out-of-scope", "low-value"].includes(candidate?.disposition)) {
        errors.push(`${prefix}.disposition is invalid`);
      }
      if (!nonEmptyString(candidate?.reason)) errors.push(`${prefix}.reason is required`);
    }
  }
  if (blocked) {
    if (result.mode !== "initial") errors.push("blocked is only valid in initial mode");
    const blocker = result.blocker;
    if (!nonEmptyString(blocker?.reason)) errors.push("blocker.reason is required");
    const behaviors = Array.isArray(blocker?.publicBehaviors) ? blocker.publicBehaviors : [];
    if (behaviors.length === 0) errors.push("blocker.publicBehaviors must not be empty");
    for (const [index, behavior] of behaviors.entries()) {
      for (const field of ["behavior", "observableVia", "isolationObstacle"]) {
        if (!nonEmptyString(behavior?.[field])) {
          errors.push(`blocker.publicBehaviors[${index}].${field} is required`);
        }
      }
    }
    const seamAudit = blocker?.seamAudit;
    for (const seam of ["constructorInjection", "abstractionOverload", "overridableHook"]) {
      if (seamAudit?.[seam]?.available !== false) {
        errors.push(`blocker.seamAudit.${seam}.available must be false`);
      }
      if (!nonEmptyString(seamAudit?.[seam]?.evidence)) {
        errors.push(`blocker.seamAudit.${seam}.evidence is required`);
      }
    }
    if (blocker?.productionChangeRequired !== true) {
      errors.push("blocker.productionChangeRequired must be true");
    }
    if (blocker?.productionModificationInScope !== false) {
      errors.push("blocker.productionModificationInScope must be false");
    }
    const recommendations = Array.isArray(blocker?.recommendations) ? blocker.recommendations : [];
    if (recommendations.length === 0) errors.push("blocker.recommendations must not be empty");
    const seamKinds = new Set(["time", "filesystem", "output-path", "dependency-injection", "other"]);
    for (const [index, recommendation] of recommendations.entries()) {
      if (!seamKinds.has(recommendation?.seam)) {
        errors.push(`blocker.recommendations[${index}].seam is invalid`);
      }
      if (!nonEmptyString(recommendation?.action)) {
        errors.push(`blocker.recommendations[${index}].action is required`);
      }
    }
  }
  return errors;
}

function validateUserScenarios(result, manifestPath) {
  const errors = [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) errors.push("user scenario manifest schemaVersion must be 1");
  const expected = Array.isArray(manifest.scenarios) ? manifest.scenarios : [];
  const expectedIds = new Set();
  for (const [index, item] of expected.entries()) {
    if (!nonEmptyString(item?.id)) errors.push(`user scenarios[${index}].id must be non-empty`);
    else if (expectedIds.has(item.id)) errors.push(`user scenarios[${index}].id must be unique`);
    else expectedIds.add(item.id);
    if (!nonEmptyString(item?.text)) errors.push(`user scenarios[${index}].text must be non-empty`);
  }

  const coverage = Array.isArray(result.scenarioCoverage) ? result.scenarioCoverage : [];
  const seen = new Set();
  const testMethods = new Set(
    (result.scenarioPlan ?? []).map((scenario) => scenario.testMethod).filter(nonEmptyString),
  );
  for (const [index, item] of coverage.entries()) {
    const prefix = `scenarioCoverage[${index}]`;
    if (!expectedIds.has(item?.id)) errors.push(`${prefix}.id is not in user scenario manifest`);
    else if (seen.has(item.id)) errors.push(`${prefix}.id must be unique`);
    else seen.add(item.id);
    if (!["implemented", "rejected", "blocked"].includes(item?.status)) {
      errors.push(`${prefix}.status is invalid`);
    }
    if (item?.status === "implemented") {
      if (!nonEmptyString(item.testMethod) || !testMethods.has(item.testMethod)) {
        errors.push(`${prefix}.testMethod must reference a planned test method`);
      }
    } else if (["rejected", "blocked"].includes(item?.status) && !nonEmptyString(item.reason)) {
      errors.push(`${prefix}.reason is required when status is ${item.status}`);
    }
  }
  for (const id of expectedIds) {
    if (!seen.has(id)) errors.push(`missing user scenario disposition: ${id}`);
  }
  return errors;
}

const argv = process.argv.slice(2);
const input = argv[0];
const userScenariosIndex = argv.indexOf("--user-scenarios");
const userScenariosPath = userScenariosIndex >= 0
  ? path.resolve(argv[userScenariosIndex + 1])
  : null;
if (!input) {
  console.error(
    "Usage: node scripts/check-unit-author-result.mjs <authorResultPath> [--user-scenarios <manifest>]",
  );
  process.exit(2);
}

const inputPath = path.resolve(input);
let result;
try {
  result = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  console.error(JSON.stringify({ passed: false, inputPath, errors: [error.message] }, null, 2));
  process.exit(1);
}

const errors = validate(result, inputPath);
if (userScenariosPath) {
  try {
    errors.push(...validateUserScenarios(result, userScenariosPath));
  } catch (error) {
    errors.push(`user scenario manifest invalid: ${error.message}`);
  }
}
console.log(JSON.stringify({ passed: errors.length === 0, inputPath, errors }, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
