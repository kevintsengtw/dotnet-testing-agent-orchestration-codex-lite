#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const result = { testFiles: [], allowNoTestFiles: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--allow-no-test-files") {
      result.allowNoTestFiles = true;
      continue;
    }
    const value = argv[index + 1];
    if (key === "--test-project") result.testProject = value;
    else if (key === "--target-project") result.targetProject = value;
    else if (key === "--production-baseline") result.productionBaseline = value;
    else if (key === "--test-file") result.testFiles.push(value);
    else if (key === "--output") result.output = value;
    else throw new Error(`未知參數: ${key}`);
    index += 1;
  }
  return result;
}

function evaluateProject(projectPath) {
  const result = spawnSync(
    "dotnet",
    [
      "msbuild",
      projectPath,
      "-nologo",
      "-getProperty:IsTestProject",
      "-getProperty:TargetFramework",
      "-getProperty:TargetFrameworks",
      "-getItem:ProjectReference",
      "-getItem:Compile",
      "-getItem:PackageReference",
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "dotnet msbuild failed").trim());
  }
  return JSON.parse(result.stdout);
}

function fullPaths(items) {
  return new Set(
    (items ?? [])
      .map((item) => item.FullPath)
      .filter(Boolean)
      .map((value) => path.resolve(value)),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = [];
  if (!args.testProject) errors.push("testProject is required");
  if (!args.targetProject && !args.productionBaseline) {
    errors.push("targetProject or productionBaseline is required");
  }
  if (!args.allowNoTestFiles && args.testFiles.length === 0) {
    errors.push("at least one --test-file is required");
  }
  if (errors.length > 0) {
    console.log(JSON.stringify({ passed: false, errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const testProject = path.resolve(args.testProject);
  if (args.productionBaseline) {
    const baselinePath = path.resolve(args.productionBaseline);
    if (!fs.existsSync(baselinePath)) {
      errors.push("productionBaseline does not exist");
    } else {
      try {
        const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
        if (!baseline.targetProject) errors.push("productionBaseline.targetProject is required");
        else if (
          args.targetProject &&
          path.resolve(args.targetProject) !== path.resolve(baseline.targetProject)
        ) {
          errors.push("targetProject does not match productionBaseline.targetProject");
        } else {
          args.targetProject = baseline.targetProject;
        }
      } catch (error) {
        errors.push(`productionBaseline is invalid: ${error.message}`);
      }
    }
  }
  if (errors.length > 0) {
    console.log(JSON.stringify({ passed: false, errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  const targetProject = path.resolve(args.targetProject);
  for (const [name, value] of [["testProject", testProject], ["targetProject", targetProject]]) {
    if (!fs.existsSync(value)) errors.push(`${name} does not exist`);
    else if (path.extname(value).toLowerCase() !== ".csproj") errors.push(`${name} must be a csproj`);
  }
  for (const file of args.testFiles) {
    if (!fs.existsSync(path.resolve(file))) errors.push(`test file does not exist: ${file}`);
  }
  if (errors.length > 0) {
    console.log(JSON.stringify({ passed: false, errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const test = evaluateProject(testProject);
  const target = evaluateProject(targetProject);
  const properties = test.Properties ?? {};
  const targetProperties = target.Properties ?? {};
  if ((properties.IsTestProject ?? "").toLowerCase() !== "true") {
    errors.push("IsTestProject must evaluate to true");
  }

  const references = fullPaths(test.Items?.ProjectReference);
  if (!references.has(targetProject)) errors.push("target project is missing from ProjectReference");

  const compileItems = fullPaths(test.Items?.Compile);
  for (const file of args.testFiles.map((value) => path.resolve(value))) {
    if (!compileItems.has(file)) errors.push(`test file is not compiled by the test project: ${file}`);
  }

  const packages = new Set(
    (test.Items?.PackageReference ?? []).map((item) => item.Identity.toLowerCase()),
  );
  for (const packageName of [
    "microsoft.net.test.sdk",
    "xunit",
    "xunit.runner.visualstudio",
    "coverlet.collector",
  ]) {
    if (!packages.has(packageName)) errors.push(`required PackageReference is missing: ${packageName}`);
  }

  const testFramework = properties.TargetFramework;
  const targetFrameworks = new Set(
    [targetProperties.TargetFramework, ...(targetProperties.TargetFrameworks ?? "").split(";")]
      .filter(Boolean),
  );
  if (!testFramework) errors.push("TargetFramework must evaluate to a value");
  if (testFramework && targetFrameworks.size > 0 && !targetFrameworks.has(testFramework)) {
    errors.push(`test TargetFramework ${testFramework} does not match target project`);
  }

  const report = {
    passed: errors.length === 0,
    testProject,
    targetProject,
    testFiles: args.testFiles.map((value) => path.resolve(value)),
    targetFramework: testFramework,
    errors,
  };
  if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = errors.length === 0 ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({ passed: false, errors: [error.message] }, null, 2));
  process.exitCode = 1;
}
