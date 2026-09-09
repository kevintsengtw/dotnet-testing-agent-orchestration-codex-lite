#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectTestMethods, findPublicTestClass } from "../lib/test-source-analysis.mjs";

function validateMethodName(name) {
  const hardViolations = [];
  const advisories = [];
  const segments = name.split("_");

  if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) {
    hardViolations.push("method name must be a valid C#-style identifier");
    return { hardViolations, advisories };
  }

  if (segments.some((segment) => segment.trim().length === 0)) {
    hardViolations.push("method name must not contain empty underscore-separated fragments");
    return { hardViolations, advisories };
  }

  if (segments.length !== 3) {
    advisories.push("preferred style is three purpose-oriented underscore-separated fragments");
    return { hardViolations, advisories };
  }

  const [methodName, scenario, expected] = segments;
  if (!/^(?:[A-Za-z][A-Za-z0-9]*|建構式)$/.test(methodName)) {
    advisories.push("preferred style uses a single identifier as the first fragment");
  }
  if (scenario.length < 3) {
    advisories.push("scenario fragment is very short and may hide test intent");
  }
  if (!/[\u3400-\u9FFF]/u.test(scenario)) {
    advisories.push("scenario fragment should usually contain Chinese wording for this workflow");
  }
  if (/^When[A-Z]/.test(scenario)) {
    advisories.push("scenario fragment should avoid English When... style when a clearer local phrasing exists");
  }
  if (!/^(?:應|不應)/u.test(expected)) {
    advisories.push("expected fragment should usually start with 應 or 不應");
  }

  return { hardViolations, advisories };
}

function validateFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const className = findPublicTestClass(sourceText);
  const violations = [];

  if (!className) {
    violations.push({
      kind: "class",
      message: "missing public test class declaration",
    });
  } else if (!className.endsWith("Tests")) {
    violations.push({
      kind: "class",
      message: "test class name must end with Tests",
      className,
    });
  }

  const methods = collectTestMethods(sourceText);
  if (methods.length === 0) {
    violations.push({
      kind: "file",
      message: "no test methods detected by naming verifier",
    });
  }

  for (const method of methods) {
    const validation = validateMethodName(method.name);
    for (const message of validation.hardViolations) {
      violations.push({
        kind: "method",
        line: method.line,
        methodName: method.name,
        severity: "hard",
        message,
      });
    }
    for (const message of validation.advisories) {
      violations.push({
        kind: "method",
        line: method.line,
        methodName: method.name,
        severity: "advisory",
        message,
      });
    }
  }

  return {
    filePath,
    className,
    methodCount: methods.length,
    violations,
    passed: violations.every((violation) => violation.severity !== "hard"),
  };
}

const strict = process.argv.includes("--strict");
const fileArgs = process.argv.slice(2).filter((input) => input !== "--strict").map((input) => path.resolve(input));

if (fileArgs.length === 0) {
  console.error("Usage: node .codex/scripts/dotnet-testing-lite/gates/check-test-naming-conventions.mjs [--strict] <testFile1> [testFile2...]");
  process.exit(2);
}

const results = fileArgs.map(validateFile);
const failed = results.some(
  (result) =>
    !result.passed ||
    (strict && result.violations.some((violation) => violation.severity === "advisory")),
);

console.log(JSON.stringify({
  passed: !failed,
  strict,
  files: results,
}, null, 2));

process.exit(failed ? 1 : 0);
