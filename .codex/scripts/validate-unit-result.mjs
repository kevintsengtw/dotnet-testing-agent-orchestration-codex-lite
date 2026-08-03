#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectTestMethods } from "../../scripts/test-source-analysis.mjs";

const args = process.argv.slice(2);
const manifestPath = args[args.indexOf("--manifest") + 1];
const requireThreshold = args.includes("--require-threshold");
const requireQuality = args.includes("--require-quality");

if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error("validate-unit-result error: manifest not found");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
const notSuitable = manifest.coverageDecision?.status === "not_suitable";

if (notSuitable) {
  if (!requireQuality) errors.push("not_suitable requires --require-quality");
  if (manifest.status !== "not_suitable") errors.push("status must be not_suitable");
  if (manifest.build?.status !== "not_run") errors.push("not_suitable build must be not_run");
  if (manifest.test?.status !== "not_run") errors.push("not_suitable test must be not_run");
  if (manifest.coverage?.status !== "not_applicable") {
    errors.push("not_suitable coverage must be not_applicable");
  }
  if (manifest.goal?.status !== "not_applicable") {
    errors.push("not_suitable goal must be not_applicable");
  }
  if (manifest.projectValidation?.status !== "passed") {
    errors.push("projectValidation must pass");
  }
  if (manifest.productionIntegrity?.status !== "passed") {
    errors.push("productionIntegrity must pass");
  }
  if (!Number.isFinite(manifest.durationMs) || manifest.durationMs <= 0) {
    errors.push("durationMs must be greater than zero");
  }
  if (manifest.quality?.status !== "not_applicable") {
    errors.push("not_suitable quality must be not_applicable");
  }
  if (!Array.isArray(manifest.quality?.issues) || manifest.quality.issues.length !== 0) {
    errors.push("not_suitable quality.issues must be empty");
  }
  if (manifest.qualityScore !== null) errors.push("not_suitable qualityScore must be null");
  if (
    manifest.testValue?.status !== "no_valuable_tests" ||
    !Array.isArray(manifest.testValue?.valuableMethods) ||
    manifest.testValue.valuableMethods.length !== 0 ||
    !Array.isArray(manifest.testValue?.lowValueMethods) ||
    manifest.testValue.lowValueMethods.length !== 0
  ) {
    errors.push("not_suitable testValue must confirm empty valuable and low-value methods");
  }
  const deliverables = manifest.deliverables;
  if (!deliverables?.testProjectPath || !fs.existsSync(deliverables.testProjectPath)) {
    errors.push("deliverables.testProjectPath must exist");
  }
  if (!Array.isArray(deliverables?.testFilePaths) || deliverables.testFilePaths.length !== 0) {
    errors.push("not_suitable deliverables.testFilePaths must be empty");
  }
  if (!manifest.authorResultPath || !fs.existsSync(manifest.authorResultPath)) {
    errors.push("not_suitable authorResultPath must exist");
  } else {
    try {
      const authorResult = JSON.parse(fs.readFileSync(manifest.authorResultPath, "utf8"));
      if (authorResult.status !== "no_valuable_tests") {
        errors.push("author result must have no_valuable_tests status");
      }
    } catch (error) {
      errors.push(`author result is invalid: ${error.message}`);
    }
  }
  const review = manifest.notSuitableReview;
  if (review?.status !== "confirmed") errors.push("notSuitableReview.status must be confirmed");
  if (typeof review?.reason !== "string" || review.reason.length === 0) {
    errors.push("notSuitableReview.reason is required");
  }
  if (!Array.isArray(review?.candidateBehaviors) || review.candidateBehaviors.length === 0) {
    errors.push("notSuitableReview.candidateBehaviors must not be empty");
  } else {
    for (const [index, candidate] of review.candidateBehaviors.entries()) {
      if (typeof candidate?.behavior !== "string" || candidate.behavior.length === 0) {
        errors.push(`notSuitableReview.candidateBehaviors[${index}].behavior is required`);
      }
      if (typeof candidate?.reason !== "string" || candidate.reason.length === 0) {
        errors.push(`notSuitableReview.candidateBehaviors[${index}].reason is required`);
      }
    }
  }
  if (!Array.isArray(manifest.coverageDecision?.repairable)) {
    errors.push("coverageDecision.repairable must be an array");
  } else if (manifest.coverageDecision.repairable.length !== 0) {
    errors.push("not_suitable cannot contain repairable test gaps");
  }
  if (!Array.isArray(manifest.coverageDecision?.uncoverable) ||
      manifest.coverageDecision.uncoverable.length === 0) {
    errors.push("not_suitable requires uncoverable reasons");
  } else {
    for (const [index, item] of manifest.coverageDecision.uncoverable.entries()) {
      if (typeof item?.reason !== "string" || item.reason.length === 0) {
        errors.push(`coverageDecision.uncoverable[${index}].reason is required`);
      }
    }
  }
  if (manifest.isFinal !== true) errors.push("not_suitable must be final");

  if (errors.length > 0) {
    console.error(`validate-unit-result failed:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: "passed",
    line: null,
    branch: null,
    goalMet: null,
    qualityScore: null,
    decision: "not_suitable",
  }));
  process.exit(0);
}

const decision = manifest.coverageDecision;
const buildStatus = manifest.build?.status;
const testStatus = manifest.test?.status;
const executionFailed = buildStatus !== "passed" || testStatus !== "passed";
const eligibility = manifest.repairEligibility;
const eligibleBuildRepair =
  eligibility?.failedPhase === "build" &&
  buildStatus === "failed" &&
  ["not_run", "failed"].includes(testStatus);
const eligibleTestRepair =
  eligibility?.failedPhase === "test" &&
  buildStatus === "passed" &&
  testStatus === "failed";
const eligibleTestDeliveryRepair =
  requireQuality &&
  decision?.status === "needs_repair" &&
  manifest.isFinal === false &&
  eligibility?.status === "eligible" &&
  eligibility?.scope === "test-delivery" &&
  typeof eligibility?.reason === "string" &&
  eligibility.reason.length > 0 &&
  (eligibleBuildRepair || eligibleTestRepair);

if (executionFailed && !eligibleTestDeliveryRepair) {
  if (buildStatus !== "passed") errors.push("build must pass");
  if (testStatus !== "passed") errors.push("test must pass");
}
if (!executionFailed) {
  if (!manifest.coverage?.matchedClasses?.length) errors.push("target coverage class missing");
  if (!Number.isFinite(manifest.coverage?.line?.percent)) errors.push("line coverage missing");
  if (!Number.isFinite(manifest.coverage?.branch?.percent)) errors.push("branch coverage missing");
  if (requireThreshold && manifest.goal?.met !== true) errors.push("coverage threshold not met");
}

if (requireQuality) {
  const quality = manifest.quality;
  if (!["pass", "fail"].includes(quality?.status)) errors.push("quality.status is invalid");
  if (!Array.isArray(quality?.issues)) errors.push("quality.issues must be an array");
  for (const [index, issue] of (quality?.issues ?? []).entries()) {
    if (typeof issue?.id !== "string" || issue.id.length === 0) {
      errors.push(`quality.issues[${index}].id is required`);
    }
    if (!["value", "oracle", "boundary", "state", "interaction", "isolation", "readability", "delivery"]
      .includes(issue?.category)) {
      errors.push(`quality.issues[${index}].category is invalid`);
    }
    if (typeof issue?.description !== "string" || issue.description.length === 0) {
      errors.push(`quality.issues[${index}].description is required`);
    }
    if (typeof issue?.repairable !== "boolean") {
      errors.push(`quality.issues[${index}].repairable must be boolean`);
    }
    if (!Array.isArray(issue?.scenarioIds)) {
      errors.push(`quality.issues[${index}].scenarioIds must be an array`);
    }
  }

  const score = manifest.qualityScore;
  const categories = [
    ["behaviorAndOracle", 25],
    ["boundariesAndBranches", 25],
    ["precedenceAndState", 20],
    ["isolationAndDeterminism", 15],
    ["readabilityAndMaintainability", 15],
  ];
  let scoreTotal = 0;
  for (const [name, maximum] of categories) {
    const value = score?.[name];
    if (!Number.isInteger(value?.score) || value.score < 0 || value.score > maximum) {
      errors.push(`qualityScore.${name}.score must be between 0 and ${maximum}`);
    } else {
      scoreTotal += value.score;
    }
    if (!Array.isArray(value?.evidence) || value.evidence.length === 0) {
      errors.push(`qualityScore.${name}.evidence must not be empty`);
    }
  }
  if (score?.total !== scoreTotal) errors.push("qualityScore.total must equal category score sum");

  const testValue = manifest.testValue;
  if (testValue?.status !== "reviewed") errors.push("testValue.status must be reviewed");
  const allAuthorScenarios = testValue?.valuableMethods === "all-author-scenarios";
  const valuableMethods = Array.isArray(testValue?.valuableMethods)
    ? testValue.valuableMethods
    : [];
  const lowValueMethods = Array.isArray(testValue?.lowValueMethods)
    ? testValue.lowValueMethods
    : [];
  if (!Array.isArray(testValue?.valuableMethods) && !allAuthorScenarios) {
    errors.push("testValue.valuableMethods must be an array or all-author-scenarios");
  }
  if (!Array.isArray(testValue?.lowValueMethods)) {
    errors.push("testValue.lowValueMethods must be an array");
  }
  const classifiedMethods = new Set();
  let authorScenarios = new Map();
  if (!manifest.authorResultPath || !fs.existsSync(manifest.authorResultPath)) {
    errors.push("authorResultPath must exist");
  } else {
    try {
      const authorResult = JSON.parse(fs.readFileSync(manifest.authorResultPath, "utf8"));
      authorScenarios = new Map(
        (authorResult.scenarioPlan ?? []).map((scenario) => [scenario.id, scenario]),
      );
    } catch (error) {
      errors.push(`authorResultPath is invalid: ${error.message}`);
    }
  }
  if (allAuthorScenarios) {
    if (lowValueMethods.length > 0) {
      errors.push("all-author-scenarios cannot be combined with lowValueMethods");
    }
    for (const [scenarioId, scenario] of authorScenarios) {
      if (typeof scenario?.testMethod !== "string" || scenario.testMethod.length === 0) {
        errors.push(`author scenario ${scenarioId} testMethod is required`);
      } else {
        classifiedMethods.add(scenario.testMethod);
      }
      if (typeof scenario?.failureMode !== "string" || scenario.failureMode.length === 0) {
        errors.push(`author scenario ${scenarioId} failureMode is required`);
      }
    }
  }
  for (const [index, item] of valuableMethods.entries()) {
    const prefix = `testValue.valuableMethods[${index}]`;
    if (typeof item?.method !== "string" || item.method.length === 0) {
      errors.push(`${prefix}.method is required`);
    } else if (classifiedMethods.has(item.method)) {
      errors.push(`${prefix}.method must be unique`);
    } else {
      classifiedMethods.add(item.method);
    }
    if (!Array.isArray(item?.scenarioIds) || item.scenarioIds.length === 0) {
      errors.push(`${prefix}.scenarioIds must not be empty`);
    } else {
      for (const scenarioId of item.scenarioIds) {
        const scenario = authorScenarios.get(scenarioId);
        if (!scenario) {
          errors.push(`${prefix}.scenarioIds contains unknown id: ${scenarioId}`);
        } else {
          if (scenario.testMethod !== item.method) {
            errors.push(`${prefix}.method must match author scenario testMethod`);
          }
          if (typeof scenario.failureMode !== "string" || scenario.failureMode.length === 0) {
            errors.push(`${prefix} author scenario failureMode is required`);
          }
        }
      }
    }
  }
  const validLowValuePatterns = new Set([
    "not-throw",
    "constructor-smoke",
    "assignability",
    "non-null",
    "auto-property-roundtrip",
    "implementation-detail",
    "other",
  ]);
  for (const [index, item] of lowValueMethods.entries()) {
    const prefix = `testValue.lowValueMethods[${index}]`;
    if (typeof item?.method !== "string" || item.method.length === 0) {
      errors.push(`${prefix}.method is required`);
    } else if (classifiedMethods.has(item.method)) {
      errors.push(`${prefix}.method must be unique`);
    } else {
      classifiedMethods.add(item.method);
    }
    if (!validLowValuePatterns.has(item?.pattern)) errors.push(`${prefix}.pattern is invalid`);
    if (typeof item?.reason !== "string" || item.reason.length === 0) {
      errors.push(`${prefix}.reason is required`);
    }
    if (typeof item?.repairable !== "boolean") {
      errors.push(`${prefix}.repairable must be boolean`);
    }
  }

  if (manifest.projectValidation?.status !== "passed") {
    errors.push("projectValidation must pass");
  }
  if (manifest.productionIntegrity?.status !== "passed") {
    errors.push("productionIntegrity must pass");
  }
  if (!Number.isFinite(manifest.durationMs) || manifest.durationMs <= 0) {
    errors.push("durationMs must be greater than zero");
  }
  if (!Number.isInteger(manifest.build?.warnings?.count) || manifest.build.warnings.count < 0) {
    errors.push("build warning count must be recorded");
  }

  const deliverables = manifest.deliverables;
  const testProjectPath = deliverables?.testProjectPath;
  const testFilePaths = Array.isArray(deliverables?.testFilePaths)
    ? deliverables.testFilePaths
    : [];
  if (!testProjectPath || !fs.existsSync(testProjectPath)) {
    errors.push("deliverables.testProjectPath must exist");
  }
  if (testFilePaths.length === 0) errors.push("deliverables.testFilePaths must not be empty");
  const testWarning = (manifest.build?.warnings?.lines ?? []).some((line) =>
    testFilePaths.some((file) => line.includes(path.resolve(file))));
  if (
    testWarning &&
    !(quality?.issues ?? []).some((issue) =>
      ["readability", "delivery"].includes(issue.category))
  ) {
    errors.push("test-file warnings require a readability or delivery quality issue");
  }
  const projectDirectory = testProjectPath ? path.dirname(path.resolve(testProjectPath)) : null;
  for (const [index, file] of testFilePaths.entries()) {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) errors.push(`deliverables.testFilePaths[${index}] must exist`);
    if (projectDirectory) {
      const relative = path.relative(projectDirectory, resolved);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        errors.push(`deliverables.testFilePaths[${index}] must be inside test project`);
      }
    }
  }
  const actualTestMethods = new Set();
  for (const file of testFilePaths) {
    if (!fs.existsSync(file)) continue;
    for (const method of collectTestMethods(fs.readFileSync(file, "utf8"))) {
      actualTestMethods.add(method.name);
    }
  }
  for (const method of actualTestMethods) {
    if (!classifiedMethods.has(method)) errors.push(`test method is missing value classification: ${method}`);
  }
  for (const method of classifiedMethods) {
    if (!actualTestMethods.has(method)) errors.push(`classified test method not found in C# source: ${method}`);
  }
  if (actualTestMethods.size > 0 && valuableMethods.length === 0 && !allAuthorScenarios) {
    errors.push("at least one valuable test method is required");
  }
  if (lowValueMethods.length > 0) {
    if (quality?.status !== "fail") errors.push("low-value tests require quality fail");
    if ((score?.total ?? 100) > 79) errors.push("low-value tests cap quality score at 79");
    if (!(quality?.issues ?? []).some((issue) => issue.category === "value")) {
      errors.push("low-value tests require a value quality issue");
    }
  }

  const validDecisions = ["pass", "needs_repair", "best_effort", "fail"];
  if (!validDecisions.includes(decision?.status)) errors.push("coverageDecision.status is invalid");
  if (!Array.isArray(decision?.repairable)) errors.push("coverageDecision.repairable must be an array");
  if (!Array.isArray(decision?.uncoverable)) errors.push("coverageDecision.uncoverable must be an array");
  if (typeof manifest.isFinal !== "boolean") errors.push("isFinal must be boolean");

  const repairableQuality = (quality?.issues ?? []).some((issue) => issue.repairable === true);
  const repairableValue = lowValueMethods.some((item) => item.repairable === true);
  const hasRepairable =
    repairableQuality || repairableValue || (decision?.repairable?.length ?? 0) > 0;
  if (decision?.status === "pass") {
    if (manifest.goal?.met !== true) errors.push("pass decision requires coverage goal");
    if (quality?.status !== "pass") errors.push("pass decision requires quality pass");
    if ((score?.total ?? 0) < 90) errors.push("pass decision requires quality score >= 90");
  }
  if (decision?.status === "best_effort") {
    if (manifest.goal?.met === true) errors.push("best_effort requires an unmet coverage goal");
    if (quality?.status !== "pass") errors.push("best_effort requires quality pass");
    if ((score?.total ?? 0) < 90) errors.push("best_effort requires quality score >= 90");
    if (lowValueMethods.length > 0) errors.push("best_effort cannot retain low-value tests");
    if (hasRepairable) errors.push("best_effort cannot contain repairable gaps");
    if ((decision?.uncoverable?.length ?? 0) === 0) {
      errors.push("best_effort requires uncoverable gaps");
    }
  }
  if (decision?.status === "needs_repair") {
    if (manifest.isFinal === true) errors.push("final verification cannot request repair");
    if (!hasRepairable) errors.push("needs_repair requires a repairable gap");
    if (executionFailed) {
      if (!eligibleTestDeliveryRepair) {
        errors.push("failed build/test repair requires eligible test-delivery evidence");
      }
      const hasTestDeliveryIssue = (quality?.issues ?? []).some(
        (issue) =>
          issue.repairable === true &&
          ["delivery", "isolation"].includes(issue.category),
      );
      if (!hasTestDeliveryIssue) {
        errors.push("failed build/test repair requires a repairable delivery or isolation issue");
      }
    } else if (manifest.repairEligibility != null) {
      errors.push("repairEligibility is only valid for failed build/test delivery");
    }
    if (!manifest.repairManifestPath || !fs.existsSync(manifest.repairManifestPath)) {
      errors.push("needs_repair requires an existing repairManifestPath");
    } else {
      if (fs.statSync(manifest.repairManifestPath).size > 4 * 1024) {
        errors.push("repair manifest must stay below 4 KiB");
      }
      try {
        const repair = JSON.parse(fs.readFileSync(manifest.repairManifestPath, "utf8"));
        if (repair.schemaVersion !== 1) errors.push("repair manifest schemaVersion must be 1");
        if (typeof repair.target !== "string" || repair.target.length === 0) {
          errors.push("repair manifest target is required");
        }
        if (!Array.isArray(repair.coverageGaps)) {
          errors.push("repair manifest coverageGaps must be an array");
        }
        if (!Array.isArray(repair.qualityGaps)) {
          errors.push("repair manifest qualityGaps must be an array");
        } else {
          for (const [index, gap] of repair.qualityGaps.entries()) {
            for (const field of ["reason", "action", "expectedBehavior", "oracle"]) {
              if (typeof gap?.[field] !== "string" || gap[field].length === 0) {
                errors.push(`qualityGaps[${index}].${field} is required`);
              }
            }
          }
        }
        if (executionFailed) {
          if (!repair.testDeliveryGap || typeof repair.testDeliveryGap !== "object") {
            errors.push("failed build/test repair manifest requires testDeliveryGap");
          } else {
            if (!["project-config", "test-source", "isolation"]
              .includes(repair.testDeliveryGap.kind)) {
              errors.push("testDeliveryGap.kind is invalid");
            }
            if (repair.testDeliveryGap.phase !== manifest.repairEligibility?.failedPhase) {
              errors.push("testDeliveryGap.phase must match repairEligibility.failedPhase");
            }
            for (const field of ["reason", "action"]) {
              if (typeof repair.testDeliveryGap[field] !== "string" ||
                  repair.testDeliveryGap[field].length === 0) {
                errors.push(`testDeliveryGap.${field} is required`);
              }
            }
          }
        } else if (repair.testDeliveryGap != null) {
          errors.push("testDeliveryGap is only valid for failed build/test delivery");
        }
      } catch (error) {
        errors.push(`repair manifest is invalid: ${error.message}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`validate-unit-result failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: "passed",
    line: executionFailed ? null : manifest.coverage.line.percent,
    branch: executionFailed ? null : manifest.coverage.branch.percent,
    goalMet: executionFailed ? null : manifest.goal.met,
    ...(requireQuality
      ? {
          qualityScore: manifest.qualityScore.total,
          decision: manifest.coverageDecision.status,
        }
      : {}),
  }),
);
