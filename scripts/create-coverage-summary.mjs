#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] === "--coverage-base") result.base = argv[index + 1];
    else if (argv[index] === "--output") result.output = argv[index + 1];
    else throw new Error(`未知參數: ${argv[index]}`);
  }
  if (!result.base || !result.output) throw new Error("--coverage-base and --output are required");
  return result;
}

function compactIntegrity(value) {
  if (!value) return null;
  return {
    status: value.status,
    ...(value.added?.length ? { added: value.added } : {}),
    ...(value.deleted?.length ? { deleted: value.deleted } : {}),
    ...(value.modified?.length ? { modified: value.modified } : {}),
    ...(value.errors?.length ? { errors: value.errors } : {}),
  };
}

const input = args(process.argv.slice(2));
const basePath = path.resolve(input.base);
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
if (base.schemaVersion !== 1) throw new Error("coverage base schemaVersion must be 1");
const coverage = base.coverage
  ? {
      ...(base.coverage.error ? { error: base.coverage.error } : {}),
      matchedClasses: (base.coverage.matchedClasses ?? []).map((item) => ({
        name: item.name,
        filename: item.filename,
      })),
      line: base.coverage.line,
      branch: base.coverage.branch,
    }
  : null;
const summary = {
  schemaVersion: 1,
  coverageBasePath: basePath,
  status: base.status,
  target: base.target,
  testProjectPath: base.testProjectPath,
  build: base.build,
  test: base.test
    ? {
        status: base.test.status,
        exitCode: base.test.exitCode,
        durationMs: base.test.durationMs,
        counts: base.test.counts,
        ...(base.test.outputTail ? { outputTail: base.test.outputTail } : {}),
      }
    : null,
  coverage,
  goal: base.goal ?? null,
  productionIntegrity: compactIntegrity(base.productionIntegrity),
  durationMs: base.durationMs,
};
const outputPath = path.resolve(input.output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(summary)}\n`);
console.log(JSON.stringify({
  status: "created",
  outputPath,
  characters: fs.readFileSync(outputPath, "utf8").length,
}));
