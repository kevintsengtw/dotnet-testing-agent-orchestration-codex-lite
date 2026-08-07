#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const result = { readFiles: [], writtenFiles: [], patternsLoaded: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (key === "--author-result") result.authorResult = value;
    else if (key === "--repair-manifest") result.repairManifest = value;
    else if (key === "--read-file") result.readFiles.push(value);
    else if (key === "--written-file") result.writtenFiles.push(value);
    else if (key === "--pattern-loaded") result.patternsLoaded.push(value);
    else throw new Error(`未知參數: ${key}`);
  }
  if (!result.authorResult || !result.repairManifest) {
    throw new Error("--author-result and --repair-manifest are required");
  }
  return result;
}

function uniqueResolved(values) {
  return [...new Set(values.map((value) => path.resolve(value)))];
}

function inferPatterns(readFiles) {
  return readFiles
    .filter((value) => path.basename(value) === "SKILL.md")
    .map((value) => path.basename(path.dirname(value)))
    .filter((value) => value.startsWith("dotnet-testing-"));
}

const args = parseArgs(process.argv.slice(2));
const authorResultPath = path.resolve(args.authorResult);
const repairManifestPath = path.resolve(args.repairManifest);
const repair = JSON.parse(fs.readFileSync(repairManifestPath, "utf8"));
if (repair.testDeliveryGap?.kind !== "project-config" ||
    (repair.coverageGaps?.length ?? 0) !== 0 ||
    (repair.qualityGaps?.length ?? 0) !== 0) {
  throw new Error("deterministic refresh only supports project-config-only delivery repair");
}
const author = JSON.parse(fs.readFileSync(authorResultPath, "utf8"));
if (author.status !== "completed") throw new Error("author result status must be completed");
author.mode = "repair";
author.patternsLoaded = [...new Set([
  ...args.patternsLoaded,
  ...inferPatterns(args.readFiles),
])];
author.tokenEstimateInputs = {
  artifactAccounting: "deterministic-copy",
  readFiles: uniqueResolved(args.readFiles),
  writtenFiles: uniqueResolved([...args.writtenFiles, authorResultPath]),
};
const temporaryPath = `${authorResultPath}.refresh.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(author, null, 2)}\n`, { flag: "wx" });
fs.renameSync(temporaryPath, authorResultPath);
console.log(JSON.stringify({
  status: "refreshed",
  authorResultPath,
  scenarioCount: author.scenarioCount,
  testMethodCount: author.testMethodCount,
}));
