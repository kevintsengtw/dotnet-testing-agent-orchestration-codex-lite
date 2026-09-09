#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const result = { dotnet: "dotnet" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--test-project") result.testProject = argv[++index];
    else if (argv[index] === "--dotnet") result.dotnet = argv[++index];
    else throw new Error(`未知參數: ${argv[index]}`);
  }
  if (!result.testProject) throw new Error("--test-project is required");
  return result;
}

function compactErrors(output) {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /(?:^|:\s)error\s+[A-Z]+\d+:/iu.test(line));
  const unique = [...new Set(lines)];
  return {
    errors: unique.slice(0, 8),
    errorCount: unique.length,
    truncated: unique.length > 8,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const testProject = path.resolve(args.testProject);
  if (!fs.existsSync(testProject)) throw new Error(`test project does not exist: ${testProject}`);
  const startedAt = Date.now();
  const result = spawnSync(
    args.dotnet,
    ["build", testProject, "--no-incremental", "--nologo", "--verbosity", "minimal"],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(args.dotnet),
    },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const compact = compactErrors(output);
  const manifest = {
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    ...compact,
  };
  if (manifest.status === "failed" && manifest.errors.length === 0) {
    manifest.errors = output.split(/\r?\n/u).filter(Boolean).slice(-4);
    manifest.errorCount = manifest.errors.length;
  }
  console.log(JSON.stringify(manifest));
  process.exitCode = result.status === 0 ? 0 : 1;
} catch (error) {
  console.error(`check-test-build error: ${error.message}`);
  process.exitCode = 1;
}
